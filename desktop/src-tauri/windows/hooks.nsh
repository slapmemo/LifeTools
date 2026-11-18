; LifeTools NSIS kancaları.
;
; Chrome eklentisi masaüstü uygulamasını native host olarak (ayrı bir lifetools-desktop.exe
; işlemi) açık tutar ve kapatılınca hemen yeniden başlatır. Çalışan exe'nin üzerine yazılamaz,
; ama Windows adını değiştirmeye izin verir. Bu yüzden yeni dosyayı kopyalamadan önce eski exe
; kenara alınır; uygulama açılışta lifetools-desktop.old*.exe kopyalarını siler.
;
; Etiketli atlama yerine sıralı deneme: ilk Rename başarılı olursa kaynak kalmaz, sonrakiler
; sessizce başarısız olur. Önceki denemelerden kalan ve hâlâ kilitli olan kopyalar için üç ad var.

!macro LT_MOVE_LOCKED_EXE
  Delete "$INSTDIR\lifetools-desktop.old.exe"
  Delete "$INSTDIR\lifetools-desktop.old2.exe"
  Delete "$INSTDIR\lifetools-desktop.old3.exe"
  Rename "$INSTDIR\lifetools-desktop.exe" "$INSTDIR\lifetools-desktop.old.exe"
  Rename "$INSTDIR\lifetools-desktop.exe" "$INSTDIR\lifetools-desktop.old2.exe"
  Rename "$INSTDIR\lifetools-desktop.exe" "$INSTDIR\lifetools-desktop.old3.exe"
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro LT_MOVE_LOCKED_EXE
!macroend

!macro NSIS_HOOK_POSTINSTALL
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro LT_MOVE_LOCKED_EXE
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Kenara alınan exe hâlâ çalışıyor olabilir; silinemezse Windows yeniden başlarken siler.
  ; Chrome native messaging kaydı burada silinmez: güncelleme sırasında kaldırıcı çalışırsa
  ; eklenti bağlantısı kopardı. Kayıt Ayarlar'daki "Bağlantıyı kaldır" ile silinir.
  Delete /REBOOTOK "$INSTDIR\lifetools-desktop.old.exe"
  Delete /REBOOTOK "$INSTDIR\lifetools-desktop.old2.exe"
  Delete /REBOOTOK "$INSTDIR\lifetools-desktop.old3.exe"
!macroend
