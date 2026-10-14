import { describe, expect, it } from 'vitest';
import { missingContactMessage, usablePhone } from '../lead-contact';

describe('usablePhone', () => {
  it('keeps a full number as given', () => {
    expect(usablePhone(' (561) 987-7200 ')).toBe('(561) 987-7200');
    expect(usablePhone('+15619877200')).toBe('+15619877200');
    expect(usablePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });

  it('treats withheld caller ID as no number', () => {
    expect(usablePhone('anonymous')).toBeUndefined();
    expect(usablePhone('Restricted')).toBeUndefined();
    expect(usablePhone('unknown')).toBeUndefined();
    expect(usablePhone('sip:anonymous@anonymous.invalid')).toBeUndefined();
  });

  it('treats a short or empty number as no number', () => {
    expect(usablePhone('987-7200')).toBeUndefined();
    expect(usablePhone('   ')).toBeUndefined();
    expect(usablePhone(null)).toBeUndefined();
    expect(usablePhone(undefined)).toBeUndefined();
  });
});

describe('missingContactMessage', () => {
  const none = { phone: undefined, email: undefined, phoneHeard: false, emailHeard: false };

  it('is null when there is a phone or an email', () => {
    expect(missingContactMessage({ ...none, phone: '5619877200' })).toBeNull();
    expect(missingContactMessage({ ...none, email: 'a@b.com', phoneHeard: true })).toBeNull();
  });

  it('asks for a number or an email when there is neither', () => {
    expect(missingContactMessage(none)).toMatch(/Ask for a callback number or an email address/);
  });

  it('says which detail did not come through', () => {
    expect(missingContactMessage({ ...none, phoneHeard: true })).toMatch(/number is incomplete/);
    expect(missingContactMessage({ ...none, emailHeard: true })).toMatch(/spell the email again/);
    expect(missingContactMessage({ ...none, phoneHeard: true, emailHeard: true })).toMatch(/Neither/);
  });
});
