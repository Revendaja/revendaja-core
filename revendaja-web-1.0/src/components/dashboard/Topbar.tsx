'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { getHome } from '@/lib/api/home';
import { queryKeys } from '@/lib/api/queryKeys';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { Icon } from './icons';
import { storeUrl } from '@/lib/storefront/domain';

const ACCOUNT_LINKS = [
  { label: 'Minha conta', href: '/conta' },
  { label: 'Planos', href: '/planos' },
  { label: 'Assinatura', href: '/assinatura' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia,';
  if (hour < 18) return 'Boa tarde,';
  return 'Boa noite,';
}

// Barra superior (dentro do painel branco): saudação + plano à esquerda; nova venda, atalho para a
// vitrine e menu do usuário à direita. No celular mostra o botão que abre a gaveta da sidebar.
export function Topbar({ collapsed, onToggleSidebar }: { collapsed: boolean; onToggleSidebar: () => void }) {
  const { user, store, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Mesma query do painel: o React Query deduplica, então não gera outra chamada.
  const unread = useUnreadNotifications();
  const homeQuery = useQuery({ queryKey: queryKeys.home(), queryFn: () => getHome(new Date()) });
  const planName = homeQuery.data?.plan.name;
  const initial = user?.name.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="flex h-18 shrink-0 items-center gap-3 border-b border-ink-100 px-5 md:px-6">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        aria-expanded={!collapsed}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-700 transition hover:bg-ink-50 md:hidden"
      >
        <Icon name="menu" />
      </button>

      <div className="min-w-0 leading-tight">
        <p className="text-xs text-ink-400">{greeting()}</p>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold text-ink-900">{user?.name ?? '—'}</h1>
          {planName && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600">
              <Icon name="sparkle" size={10} strokeWidth={2} />
              {planName}
            </span>
          )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <Link
          href="/vendas/nova"
          className="hidden h-9 items-center gap-1.5 rounded-lg bg-primary-50 px-3 text-xs font-semibold text-primary-600 transition hover:bg-primary-100 sm:inline-flex"
        >
          <Icon name="cart" size={15} />
          Nova venda
        </Link>

        <Link
          href="/notificacoes"
          aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : 'Notificações'}
          title="Notificações"
          className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition hover:bg-ink-50 hover:text-primary-500 sm:flex"
        >
          <Icon name="bell" size={16} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Link>

        {store && (
          <a
            href={storeUrl(store.handle)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir minha loja"
            title="Abrir minha loja"
            className="hidden h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-ink-700 transition hover:bg-ink-50 hover:text-primary-500 sm:flex"
          >
            <Icon name="externalLink" size={16} />
          </a>
        )}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 transition hover:bg-ink-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-500 text-[11px] font-bold text-white">
              {initial}
            </span>
            <span className="hidden max-w-36 truncate text-xs font-semibold text-ink-900 sm:block">
              {user?.name ?? '—'}
            </span>
            <Icon name="chevronDown" size={14} className={`text-ink-400 transition ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-2 w-48 rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-ink-100"
            >
              {ACCOUNT_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 border-t border-ink-100" />
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger-soft"
              >
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
