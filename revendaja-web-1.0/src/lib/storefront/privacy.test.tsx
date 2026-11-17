import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrivacyNotice } from '@/components/storefront/PrivacyNotice';
import { favoritesKey } from './favorites';
import { cartStorageKey, clearLocalData, hasSeenPrivacyNotice } from './privacy';
import { readSavedCep, readSavedCustomer, writeSavedCep, writeSavedCustomer } from './visitor';

describe('apagar os dados da vitrine neste aparelho', () => {
  beforeEach(() => window.localStorage.clear());

  it('remove carrinho, favoritos, pedido salvo e CEP da loja, e deixa o resto', () => {
    window.localStorage.setItem(cartStorageKey('loja'), '[1]');
    window.localStorage.setItem(favoritesKey('loja'), '[1]');
    window.localStorage.setItem(cartStorageKey('outra'), '[1]');
    writeSavedCustomer({ name: 'Ana', whatsapp: '11999999999', fulfillment: 'pickup', address: '', paymentMethod: 'pix' });
    writeSavedCep({ cep: '01001000', street: 'Praça da Sé', district: 'Sé', city: 'São Paulo', state: 'SP' });

    clearLocalData('loja');

    expect(window.localStorage.getItem(cartStorageKey('loja'))).toBeNull();
    expect(window.localStorage.getItem(favoritesKey('loja'))).toBeNull();
    expect(readSavedCustomer()).toBeNull();
    expect(readSavedCep()).toBeNull();
    expect(window.localStorage.getItem(cartStorageKey('outra'))).toBe('[1]');
  });
});

describe('aviso de privacidade da vitrine', () => {
  beforeEach(() => window.localStorage.clear());

  it('aparece na primeira visita, explica o que é guardado e some para sempre ao tocar em "Entendi"', async () => {
    const { unmount } = render(<PrivacyNotice />);

    expect(await screen.findByRole('region', { name: 'Aviso de privacidade' })).toHaveTextContent(/carrinho, favoritos, CEP/);
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', expect.stringContaining('/privacidade'));

    await userEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('region', { name: 'Aviso de privacidade' })).not.toBeInTheDocument();
    expect(hasSeenPrivacyNotice()).toBe(true);
    unmount();

    render(<PrivacyNotice />);
    expect(screen.queryByRole('region', { name: 'Aviso de privacidade' })).not.toBeInTheDocument();
  });
});
