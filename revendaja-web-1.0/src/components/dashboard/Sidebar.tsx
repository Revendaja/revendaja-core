'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { Icon, type IconName } from './icons';

type NavItem = { label: string; href: string; icon: IconName };
type NavGroup = { title: string; items: NavItem[] };

// Mesmos grupos do app mobile (abas Início/Estoque/Finanças/Mais); conta/plano/assinatura ficam no
// menu do avatar (Topbar). As rotas além de /dashboard ainda não têm página. O badge de Notificações vem da API.
const GROUPS: NavGroup[] = [
  {
    title: 'Geral',
    items: [
      { label: 'Painel', href: '/dashboard', icon: 'grid' },
      { label: 'Notificações', href: '/notificacoes', icon: 'bell' },
    ],
  },
  {
    title: 'Estoque',
    items: [
      { label: 'Meus produtos', href: '/produtos', icon: 'box' },
      { label: 'Novo produto', href: '/produtos/novo', icon: 'plus' },
    ],
  },
  {
    title: 'Finanças',
    items: [
      { label: 'Nova venda', href: '/vendas/nova', icon: 'cart' },
      { label: 'Vendas', href: '/vendas', icon: 'receipt' },
      { label: 'Relatórios', href: '/relatorios', icon: 'chart' },
    ],
  },
  {
    title: 'Loja',
    items: [
      { label: 'Minha loja', href: '/loja', icon: 'store' },
      { label: 'Editar loja', href: '/loja/editar', icon: 'edit' },
      { label: 'Aparência', href: '/loja/aparencia', icon: 'layout' },
      { label: 'Vendas online', href: '/loja/vendas-online', icon: 'globe' },
    ],
  },
];

// Fica direto sobre o fundo da página (sem caixa própria); só o item ativo vira um cartão branco.
// Desktop: fixa; recolhida vira uma faixa só de ícones. Mobile: gaveta por cima do conteúdo.
export function Sidebar({
  collapsed,
  onToggle,
  onClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { store } = useAuth();
  const unread = useUnreadNotifications();

  return (
    <>
      {!collapsed && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col overflow-y-auto bg-canvas px-4 py-4 shadow-xl transition-all duration-200 ease-linear md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:shadow-none ${
          collapsed ? '-translate-x-full md:w-20 md:px-3' : 'translate-x-0 md:w-64'
        }`}
      >
        <div className={`flex h-[72px] shrink-0 items-center gap-3 ${collapsed ? 'md:justify-center' : ''}`}>
          <div className={`flex min-w-0 flex-1 items-center gap-3 ${collapsed ? 'md:hidden' : ''}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-semibold text-ink-900">Revendaja</p>
              <p className="truncate text-xs text-ink-400">{store?.storeName ?? 'Sua loja'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-500 transition hover:text-ink-900"
          >
            <Icon name="chevrons" size={16} className={collapsed ? 'rotate-180' : ''} />
          </button>
        </div>

        <nav className="flex flex-col">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col border-t border-ink-200/70 pb-2 pt-3">
              <p
                className={`flex h-7 items-center px-3 text-xs text-ink-400 transition-opacity ${
                  collapsed ? 'md:pointer-events-none md:opacity-0' : ''
                }`}
              >
                {group.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href} className="relative">
                      {active && (
                        <span
                          className={`absolute bottom-2 top-2 w-1 rounded-r-full bg-primary-500 ${
                            collapsed ? '-left-3' : '-left-4'
                          }`}
                        />
                      )}
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => window.matchMedia('(max-width: 767px)').matches && onClose()}
                        className={`flex h-10 items-center gap-3 overflow-hidden rounded-xl px-3 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink-300 ${
                          collapsed ? 'md:mx-auto md:w-10 md:justify-center md:px-0' : ''
                        } ${
                          active
                            ? 'bg-white font-semibold text-ink-900 shadow-[0_1px_6px_rgba(16,24,40,0.08)]'
                            : 'font-medium text-ink-600 hover:bg-white/60 hover:text-ink-900'
                        }`}
                      >
                        <Icon name={item.icon} size={18} className={active ? 'text-primary-500' : ''} />
                        <span className={`flex-1 truncate ${collapsed ? 'md:hidden' : ''}`}>{item.label}</span>
                        {item.href === '/notificacoes' && unread > 0 && (
                          <span className={`text-[11px] font-semibold text-primary-500 ${collapsed ? 'md:hidden' : ''}`}>
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
