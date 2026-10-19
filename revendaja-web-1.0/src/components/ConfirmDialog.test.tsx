import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, FrozenWarning } from './ConfirmDialog';

function setup(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog title="Cancelar a assinatura?" confirmLabel="Continuar" onConfirm={onConfirm} onCancel={onCancel} {...props}>
      <p>Conteúdo do aviso</p>
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('mostra título, conteúdo e os dois botões', () => {
    setup();

    expect(screen.getByRole('dialog', { name: 'Cancelar a assinatura?' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo do aviso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });

  it('confirma e cancela pelos botões', async () => {
    const { onConfirm, onCancel } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fecha com Esc', async () => {
    const { onCancel } = setup();

    await userEvent.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fecha ao clicar fora, mas não ao clicar dentro da janela', async () => {
    const { onCancel } = setup();

    await userEvent.click(screen.getByText('Conteúdo do aviso'));
    expect(onCancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('enquanto a ação está em andamento, bloqueia os botões, o Esc e o clique fora', async () => {
    const { onCancel, onConfirm } = setup({ busy: true });

    expect(screen.getByRole('button', { name: 'Aguarde...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();

    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('FrozenWarning', () => {
  it('diz o limite do plano, quantos ficam congelados e que podem ser apagados', () => {
    render(<FrozenWarning count={120} planName="Inicial" limit={200} />);

    const text = screen.getByText(/O plano Inicial permite 200 produtos e você tem 320/);
    expect(text).toHaveTextContent('Os 120 mais recentes ficam congelados');
    expect(text).toHaveTextContent('pode apagá-los');
  });
});
