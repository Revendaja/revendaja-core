import { beforeEach, describe, expect, it } from 'vitest';
import {
  addressFromCep,
  greetingName,
  isValidCep,
  maskCep,
  readSavedCep,
  readSavedCustomer,
  writeSavedCep,
  writeSavedCustomer,
} from './visitor';

describe('visitor', () => {
  beforeEach(() => window.localStorage.clear());

  it('saudação: primeiro nome ou Visitante', () => {
    expect(greetingName('  Maria  da Silva')).toBe('Maria');
    expect(greetingName('')).toBe('Visitante');
    expect(greetingName(null)).toBe('Visitante');
  });

  it('CEP: máscara e validação', () => {
    expect(maskCep('01310100')).toBe('01310-100');
    expect(maskCep('0131')).toBe('0131');
    expect(isValidCep('01310-100')).toBe(true);
    expect(isValidCep('0131')).toBe(false);
  });

  it('endereço inicial a partir do CEP, com e sem rua', () => {
    const full = { cep: '01310100', street: 'Av. Paulista', district: 'Bela Vista', city: 'São Paulo', state: 'SP' };
    expect(addressFromCep(full)).toBe('Av. Paulista, Bela Vista, São Paulo - SP, CEP 01310-100');
    expect(addressFromCep({ ...full, street: '', district: '' })).toBe('São Paulo - SP, CEP 01310-100');
  });

  it('guarda e lê o CEP e o cliente; dado corrompido vira null', () => {
    writeSavedCep({ cep: '01310100', street: '', district: '', city: 'São Paulo', state: 'SP' });
    expect(readSavedCep()?.city).toBe('São Paulo');
    writeSavedCep(null);
    expect(readSavedCep()).toBeNull();

    writeSavedCustomer({ name: 'Maria', whatsapp: '(11) 99999-9999', fulfillment: 'delivery', address: 'Rua A, 1', paymentMethod: 'pix' });
    expect(readSavedCustomer()?.name).toBe('Maria');
    window.localStorage.setItem('revendaja.customer', '{oops');
    expect(readSavedCustomer()).toBeNull();
    window.localStorage.setItem('revendaja.cep', JSON.stringify({ cep: '12' }));
    expect(readSavedCep()).toBeNull();
  });
});
