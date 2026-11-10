import { describe, expect, it } from 'vitest';
import { compareVersions, desktopVersionWarning, isNewerVersion, selfUpdateAction, videoNativeError } from '../src/core/version';

describe('versions', () => {
  it('detects strictly newer versions', () => {
    expect(isNewerVersion('0.5.5', '0.5.4')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('0.5.4', '0.5.4')).toBe(false);
    expect(isNewerVersion('0.5.3', '0.5.4')).toBe(false);
    expect(isNewerVersion('x', '0.5.4')).toBe(false);
  });
  it('decides the self-update action', () => {
    expect(selfUpdateAction('0.5.4', '0.5.5', undefined)).toBe('reload');
    expect(selfUpdateAction('0.5.4', '0.5.5', '0.5.4')).toBe('reload');
    expect(selfUpdateAction('0.5.4', '0.5.5', '0.5.5')).toBe('unmanaged');
    expect(selfUpdateAction('0.5.5', '0.5.5', '0.5.5')).toBe('none');
    expect(selfUpdateAction('0.5.4', null, null)).toBe('none');
  });
  it('compares numeric major, minor and patch components', () => {
    expect(compareVersions('1.10.0', '1.9.99')).toBe(1);
    expect(compareVersions('0.5.0', '0.5.1')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.0')).toBeNull();
  });
  it('warns only when the desktop is older', () => {
    expect(desktopVersionWarning('0.5.0', '0.6.0')).toBe('Masaüstü uygulaması eski (v0.5.0). Yeni özellikler için güncelle.');
    expect(desktopVersionWarning('0.6.0', '0.6.0')).toBe('');
    expect(desktopVersionWarning('0.7.0', '0.6.0')).toBe('');
    expect(desktopVersionWarning('invalid', '0.6.0')).toBe('');
  });
  it('explains unsupported native operations', () => {
    expect(videoNativeError('Bilinmeyen işlem: video_formats')).toBe('Masaüstü uygulaması bu özelliği desteklemiyor, lütfen güncelle.');
    expect(videoNativeError('Başka hata')).toBe('Başka hata');
  });
});
