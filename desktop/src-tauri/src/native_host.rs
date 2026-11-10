//! Chrome Native Messaging ana bilgisayar (host) modu.
//! stdout YALNIZCA protokol çerçevelerini taşır; günlük/hata çıktısı stderr'e gider.

use crate::db;
use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::{json, Map, Value as Json};
use std::io::{self, Read, Write};

pub const HOST_NAME: &str = "com.mehmet.lifetools";
pub const ALLOWED_ORIGIN: &str = "chrome-extension://laejkffjeefcodgkhkgppbfimbkoppih/";
/// Eklentiden gelen bir mesajın üst sınırı.
pub const MAX_MESSAGE_BYTES: usize = 4 * 1024 * 1024;
/// Chrome, ana bilgisayardan gelen 1 MB'tan büyük mesajı reddeder.
pub const MAX_RESPONSE_BYTES: usize = 1024 * 1024;

// ---------- Çerçeve kodlama (4 bayt little-endian uzunluk + UTF-8 JSON) ----------

/// Temiz EOF'ta `None` döner. Sınırı aşan uzunlukta hata verir (gövde okunmaz).
pub fn read_frame<R: Read>(r: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut len = [0u8; 4];
    let mut got = 0;
    while got < 4 {
        match r.read(&mut len[got..]) {
            Ok(0) => {
                if got == 0 {
                    return Ok(None);
                }
                return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "Eksik çerçeve başlığı"));
            }
            Ok(n) => got += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    let size = u32::from_le_bytes(len) as usize;
    if size > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Mesaj 4 MB sınırını aşıyor"));
    }
    let mut buf = vec![0u8; size];
    r.read_exact(&mut buf)?;
    Ok(Some(buf))
}

pub fn encode_frame(payload: &[u8]) -> io::Result<Vec<u8>> {
    if payload.len() > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Mesaj 4 MB sınırını aşıyor"));
    }
    let mut out = Vec::with_capacity(payload.len() + 4);
    out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    out.extend_from_slice(payload);
    Ok(out)
}

// ---------- Base64 (blob parametreleri için; ek bağımlılık yok) ----------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let trimmed = s.trim_end_matches('=');
    if s.len() - trimmed.len() > 2 || (s.len() % 4 != 0) {
        return Err("Geçersiz base64".into());
    }
    let mut out = Vec::with_capacity(trimmed.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in trimmed.bytes() {
        let v = B64.iter().position(|&x| x == c).ok_or("Geçersiz base64")? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

// ---------- Parametre eşlemesi ----------

pub fn json_to_value(v: &Json) -> Result<Value, String> {
    match v {
        Json::Null => Ok(Value::Null),
        Json::Bool(b) => Ok(Value::Integer(*b as i64)),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(Value::Integer(i))
            } else if let Some(f) = n.as_f64() {
                Ok(Value::Real(f))
            } else {
                Err("Geçersiz sayı".into())
            }
        }
        Json::String(s) => Ok(Value::Text(s.clone())),
        Json::Object(o) if o.len() == 1 => match o.get("blob").and_then(Json::as_str) {
            Some(s) => Ok(Value::Blob(b64_decode(s)?)),
            None => Err("Desteklenmeyen parametre".into()),
        },
        _ => Err("Desteklenmeyen parametre".into()),
    }
}

pub fn value_to_json(v: ValueRef<'_>) -> Json {
    match v {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => json!({ "blob": b64_encode(b) }),
    }
}

fn parse_params(v: Option<&Json>) -> Result<Vec<Value>, String> {
    match v {
        None | Some(Json::Null) => Ok(Vec::new()),
        Some(Json::Array(a)) => a.iter().map(json_to_value).collect(),
        _ => Err("params dizi olmalı".into()),
    }
}

// ---------- İstek işleme ----------

fn run_query(conn: &Connection, sql: &str, params: &[Value]) -> rusqlite::Result<Vec<Json>> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(params.iter()))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut o = Map::new();
        for (i, n) in names.iter().enumerate() {
            o.insert(n.clone(), value_to_json(row.get_ref(i)?));
        }
        out.push(Json::Object(o));
    }
    Ok(out)
}

/// Parametresiz ifadeler (çoklu ifade dahil) `execute_batch` ile; parametreliler tek ifade olarak.
fn run_exec(conn: &Connection, sql: &str, params: &[Value]) -> rusqlite::Result<()> {
    if params.is_empty() {
        conn.execute_batch(sql)
    } else {
        run_query(conn, sql, params).map(|_| ())
    }
}

fn sql_of(v: &Json) -> Result<&str, String> {
    v.get("sql").and_then(Json::as_str).ok_or_else(|| "sql eksik".to_string())
}

fn dispatch(conn: &Connection, req: &Json) -> Result<Map<String, Json>, String> {
    let op = req.get("op").and_then(Json::as_str).ok_or("op eksik")?;
    let mut out = Map::new();
    match op {
        "video_tools_status" => { out.insert("status".into(), json!(crate::video_dl::status()?)); }
        "video_tools_install" => { crate::video_dl::begin_install()?; }
        // The extension must use a long timeout or sendNativeMessage for this modal operation.
        "video_pick_folder" => { out.insert("path".into(), json!(crate::video_dl::pick_folder(req.get("initial").and_then(Json::as_str))?)); }
        "video_settings" => { let (last, default) = crate::video_dl::settings()?; out.insert("lastDir".into(), json!(last)); out.insert("defaultDir".into(), json!(default)); }
        "video_formats" => { let url = req.get("url").and_then(Json::as_str).ok_or("url eksik")?; let data = serde_json::to_value(crate::video_dl::formats(url)?).map_err(|e| e.to_string())?; out.extend(data.as_object().ok_or("Video bilgileri geçersiz")?.clone()); }
        "video_download" => { let url = req.get("url").and_then(Json::as_str).ok_or("url eksik")?; let mode = req.get("mode").and_then(Json::as_str).ok_or("mode eksik")?; let items: Option<Vec<String>> = req.get("items").map(|v| serde_json::from_value(v.clone()).map_err(|_| "Geçersiz video seçimi".to_string())).transpose()?; out.insert("jobId".into(), json!(crate::video_dl::start_with_selection(url, mode, req.get("dir").and_then(Json::as_str), items.as_deref(), req.get("folder_name").and_then(Json::as_str))?)); }
        "video_job" => { let id = req.get("jobId").and_then(Json::as_str).ok_or("jobId eksik")?; out.insert("job".into(), json!(crate::video_dl::job_status(id)?)); }
        "video_jobs" => { out.insert("jobs".into(), json!(crate::video_dl::list()?)); }
        "video_cancel" => { let id = req.get("jobId").and_then(Json::as_str).ok_or("jobId eksik")?; crate::video_dl::cancel(id)?; }
        "ping" => {
            out.insert("app".into(), json!("LifeTools"));
            out.insert("version".into(), json!(env!("CARGO_PKG_VERSION")));
            out.insert("desktopSchema".into(), json!(db::read_version(conn).map_err(|e| e.to_string())?));
            let ext_dir = crate::extension_dir::target_dir();
            let ext_version = ext_dir.as_deref().and_then(crate::extension_dir::read_version);
            out.insert("extensionDir".into(), json!(ext_dir.map(|d| d.to_string_lossy().into_owned())));
            out.insert("extensionVersion".into(), json!(ext_version));
        }
        "exec" => {
            let params = parse_params(req.get("params"))?;
            run_exec(conn, sql_of(req)?, &params).map_err(|e| e.to_string())?;
        }
        "query" => {
            let params = parse_params(req.get("params"))?;
            let rows = run_query(conn, sql_of(req)?, &params).map_err(|e| e.to_string())?;
            out.insert("rows".into(), Json::Array(rows));
        }
        "batch" => {
            let list = req.get("statements").and_then(Json::as_array).ok_or("statements eksik")?;
            let mut parsed = Vec::with_capacity(list.len());
            for s in list {
                parsed.push((sql_of(s)?, parse_params(s.get("params"))?));
            }
            conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;
            let result = parsed
                .iter()
                .try_for_each(|(sql, params)| run_exec(conn, sql, params))
                .and_then(|_| conn.execute_batch("COMMIT"));
            if let Err(e) = result {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(e.to_string());
            }
        }
        _ => return Err(format!("Bilinmeyen işlem: {op}")),
    }
    Ok(out)
}

/// Tek bir isteği yanıta çevirir; `id` aynen geri yansıtılır.
pub fn handle(conn: &Connection, req: &Json) -> Json {
    let id = req.get("id").cloned().unwrap_or(Json::Null);
    match dispatch(conn, req) {
        Ok(mut obj) => {
            obj.insert("id".into(), id);
            obj.insert("ok".into(), Json::Bool(true));
            Json::Object(obj)
        }
        Err(e) if e.starts_with("TOOLS_MISSING:") => json!({ "id": id, "ok": false, "code": "TOOLS_MISSING", "error": e.trim_start_matches("TOOLS_MISSING: ") }),
        Err(e) => json!({ "id": id, "ok": false, "error": e }),
    }
}

pub fn serve<R: Read, W: Write>(conn: &Connection, r: &mut R, w: &mut W) -> io::Result<()> {
    while let Some(bytes) = read_frame(r)? {
        let resp = match serde_json::from_slice::<Json>(&bytes) {
            Ok(req) => handle(conn, &req),
            Err(e) => json!({ "id": null, "ok": false, "error": format!("Geçersiz JSON: {e}") }),
        };
        let mut body = serde_json::to_vec(&resp)?;
        if body.len() > MAX_RESPONSE_BYTES {
            let id = resp.get("id").cloned().unwrap_or(Json::Null);
            body = serde_json::to_vec(&json!({ "id": id, "ok": false, "error": "Yanıt 1 MB sınırını aşıyor" }))?;
        }
        w.write_all(&encode_frame(&body)?)?;
        w.flush()?;
    }
    Ok(())
}

/// Yalnızca sabit eklenti kaynağına izin verilir; `chrome-extension://` ile başlayan her argüman eşleşmeli.
pub fn origin_allowed(args: &[String]) -> bool {
    let origins: Vec<&String> = args.iter().filter(|a| a.starts_with("chrome-extension://")).collect();
    !origins.is_empty() && origins.iter().all(|a| a.as_str() == ALLOWED_ORIGIN)
}

/// Çıkış kodunu döndürür.
pub fn run(args: &[String]) -> i32 {
    if !origin_allowed(args) {
        eprintln!("İzin verilmeyen kaynak; reddedildi.");
        return 2;
    }
    let opened = db::default_path()
        .and_then(|p| db::open(&p).map_err(|e| e.to_string()))
        .and_then(|mut c| db::upgrade_version_key(&mut c).map(|_| c).map_err(|e| e.to_string()));
    let conn = match opened {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Veritabanı açılamadı: {e}");
            return 1;
        }
    };
    let stdin = io::stdin();
    let stdout = io::stdout();
    match serve(&conn, &mut stdin.lock(), &mut stdout.lock()) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("Köprü hatası: {e}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT, r REAL, b BLOB)").unwrap();
        c
    }

    fn call(c: &Connection, req: Json) -> Json {
        handle(c, &req)
    }

    #[test]
    fn frame_roundtrip_and_eof() {
        let framed = encode_frame(b"{\"a\":1}").unwrap();
        assert_eq!(&framed[..4], &7u32.to_le_bytes());
        let mut cur = Cursor::new(framed);
        assert_eq!(read_frame(&mut cur).unwrap().unwrap(), b"{\"a\":1}");
        assert!(read_frame(&mut cur).unwrap().is_none());
    }

    #[test]
    fn frame_rejects_oversize_and_truncated() {
        let mut big = Cursor::new(((MAX_MESSAGE_BYTES + 1) as u32).to_le_bytes().to_vec());
        assert_eq!(read_frame(&mut big).unwrap_err().kind(), io::ErrorKind::InvalidData);
        assert!(encode_frame(&vec![0u8; MAX_MESSAGE_BYTES + 1]).is_err());
        assert!(encode_frame(&vec![0u8; MAX_MESSAGE_BYTES]).is_ok());
        let mut short_header = Cursor::new(vec![1u8, 0]);
        assert!(read_frame(&mut short_header).is_err());
        let mut short_body = Cursor::new([10u32.to_le_bytes().to_vec(), b"abc".to_vec()].concat());
        assert!(read_frame(&mut short_body).is_err());
    }

    #[test]
    fn base64_roundtrip() {
        let cases: [&[u8]; 6] = [b"", b"f", b"fo", b"foo", b"foob", &[0u8, 255, 128, 1, 2]];
        for data in cases {
            assert_eq!(b64_decode(&b64_encode(data)).unwrap(), data);
        }
        assert_eq!(b64_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(b64_encode(b"fo"), "Zm8=");
        assert!(b64_decode("@@@@").is_err());
        assert!(b64_decode("abc").is_err());
    }

    #[test]
    fn param_mapping() {
        assert_eq!(json_to_value(&json!(null)).unwrap(), Value::Null);
        assert_eq!(json_to_value(&json!(42)).unwrap(), Value::Integer(42));
        assert_eq!(json_to_value(&json!(1.5)).unwrap(), Value::Real(1.5));
        assert_eq!(json_to_value(&json!("çay")).unwrap(), Value::Text("çay".into()));
        assert_eq!(json_to_value(&json!({"blob": "AQI="})).unwrap(), Value::Blob(vec![1, 2]));
        assert!(json_to_value(&json!([1])).is_err());
        assert!(json_to_value(&json!({"x": 1})).is_err());
        assert_eq!(value_to_json(ValueRef::Integer(7)), json!(7));
        assert_eq!(value_to_json(ValueRef::Real(0.25)), json!(0.25));
        assert_eq!(value_to_json(ValueRef::Null), Json::Null);
        assert_eq!(value_to_json(ValueRef::Text("ı".as_bytes())), json!("ı"));
        assert_eq!(value_to_json(ValueRef::Blob(&[1, 2])), json!({"blob": "AQI="}));
    }

    #[test]
    fn origin_check() {
        let ok = vec![ALLOWED_ORIGIN.to_string(), "--parent-window=0".to_string()];
        assert!(origin_allowed(&ok));
        assert!(!origin_allowed(&["chrome-extension://baska/".to_string()]));
        assert!(!origin_allowed(&["chrome-extension://laejkffjeefcodgkhkgppbfimbkoppih".to_string()]));
        assert!(!origin_allowed(&[ALLOWED_ORIGIN.to_string(), "chrome-extension://baska/".to_string()]));
        assert!(!origin_allowed(&["--autostart".to_string()]));
    }

    #[test]
    fn ping_exec_query_roundtrip() {
        let c = mem();
        let p = call(&c, json!({"id": 1, "op": "ping"}));
        assert_eq!((p["ok"].clone(), p["app"].clone(), p["id"].clone()), (json!(true), json!("LifeTools"), json!(1)));
        assert_eq!(p["desktopSchema"], json!(0));
        let e = call(&c, json!({"id": 2, "op": "exec", "sql": "INSERT INTO t(a, r, b) VALUES (?, ?, ?)", "params": ["x", 2.5, {"blob": "AQI="}]}));
        assert_eq!(e["ok"], json!(true));
        let q = call(&c, json!({"id": 3, "op": "query", "sql": "SELECT a, r, b, NULL AS n FROM t WHERE a = ?", "params": ["x"]}));
        assert_eq!(q["rows"], json!([{"a": "x", "r": 2.5, "b": {"blob": "AQI="}, "n": null}]));
        let bad = call(&c, json!({"id": 4, "op": "exec", "sql": "NOT SQL"}));
        assert_eq!((bad["ok"].clone(), bad["id"].clone()), (json!(false), json!(4)));
        assert!(bad["error"].is_string());
        assert_eq!(call(&c, json!({"id": 5, "op": "zzz"}))["ok"], json!(false));
    }

    #[test]
    fn exec_supports_pragma_and_manual_transactions() {
        let c = mem();
        assert_eq!(call(&c, json!({"id": 1, "op": "exec", "sql": "PRAGMA foreign_keys=ON"}))["ok"], json!(true));
        assert_eq!(call(&c, json!({"id": 2, "op": "exec", "sql": "BEGIN"}))["ok"], json!(true));
        call(&c, json!({"id": 3, "op": "exec", "sql": "INSERT INTO t(a) VALUES (?)", "params": ["z"]}));
        assert_eq!(call(&c, json!({"id": 4, "op": "exec", "sql": "ROLLBACK"}))["ok"], json!(true));
        let q = call(&c, json!({"id": 5, "op": "query", "sql": "SELECT COUNT(*) AS n FROM t"}));
        assert_eq!(q["rows"], json!([{"n": 0}]));
    }

    #[test]
    fn batch_commits_and_rolls_back() {
        let c = mem();
        let ok = call(&c, json!({"id": 1, "op": "batch", "statements": [
            {"sql": "INSERT INTO t(a) VALUES (?)", "params": ["a"]},
            {"sql": "INSERT INTO t(a) VALUES ('b')"}
        ]}));
        assert_eq!(ok["ok"], json!(true));
        let fail = call(&c, json!({"id": 2, "op": "batch", "statements": [
            {"sql": "DELETE FROM t"},
            {"sql": "INSERT INTO t(a) VALUES (?)", "params": ["c"]},
            {"sql": "INSERT INTO missing_table VALUES (1)"}
        ]}));
        assert_eq!(fail["ok"], json!(false));
        let q = call(&c, json!({"id": 3, "op": "query", "sql": "SELECT a FROM t ORDER BY id"}));
        assert_eq!(q["rows"], json!([{"a": "a"}, {"a": "b"}]));
        assert!(c.is_autocommit());
    }

    #[test]
    fn serve_end_to_end_and_invalid_json() {
        let c = mem();
        let mut input = Vec::new();
        input.extend(encode_frame(br#"{"id":9,"op":"ping"}"#).unwrap());
        input.extend(encode_frame(b"not json").unwrap());
        input.extend(encode_frame(br#"{"id":10,"op":"query","sql":"SELECT 1 AS one"}"#).unwrap());
        let mut out = Vec::new();
        serve(&c, &mut Cursor::new(input), &mut out).unwrap();
        let mut cur = Cursor::new(out);
        let r1: Json = serde_json::from_slice(&read_frame(&mut cur).unwrap().unwrap()).unwrap();
        let r2: Json = serde_json::from_slice(&read_frame(&mut cur).unwrap().unwrap()).unwrap();
        let r3: Json = serde_json::from_slice(&read_frame(&mut cur).unwrap().unwrap()).unwrap();
        assert_eq!((r1["id"].clone(), r1["ok"].clone()), (json!(9), json!(true)));
        assert_eq!(r2["ok"], json!(false));
        assert_eq!(r3["rows"], json!([{"one": 1}]));
        assert!(read_frame(&mut cur).unwrap().is_none());
    }

    #[test]
    fn oversize_response_becomes_error() {
        let c = mem();
        let big = "x".repeat(MAX_RESPONSE_BYTES + 10);
        c.execute("INSERT INTO t(a) VALUES (?1)", [&big]).unwrap();
        let input = encode_frame(br#"{"id":1,"op":"query","sql":"SELECT a FROM t"}"#).unwrap();
        let mut out = Vec::new();
        serve(&c, &mut Cursor::new(input), &mut out).unwrap();
        let r: Json = serde_json::from_slice(&read_frame(&mut Cursor::new(out)).unwrap().unwrap()).unwrap();
        assert_eq!((r["ok"].clone(), r["id"].clone()), (json!(false), json!(1)));
    }
}
