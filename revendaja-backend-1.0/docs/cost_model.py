"""Modelo de custo por cliente do Revendaja (premissas no topo; tudo em R$ salvo indicação)."""

FX = 5.40  # R$ por US$ (mesma cotação do docs/CUSTOS_E_PLANOS.md)

# --- Preços de origem (US$) ---------------------------------------------------------------------
LUNA = {"in": 0.10, "cached": 0.01, "out": 0.50}   # por 1M tokens (Standard)
SOL = {"in": 2.00, "cached": 0.20, "out": 10.00}
TRANSCRIBE_PER_MIN = 0.0045
FLY_1GB = 6.70
S3_EGRESS_GB = 0.09

# --- Perfis de uma mensagem do assistente (tokens somados de TODAS as chamadas ao modelo) -------
# Pedido-base medido na API: 5.120 tokens (instruções + 28 ferramentas + mensagem curta).
PROFILES = {
    "simples (1 chamada)": {"in": 5_700, "out": 150},
    "consulta (2 chamadas)": {"in": 11_900, "out": 260},
    "ação (3 chamadas)": {"in": 18_500, "out": 420},
}
MIX = {"simples (1 chamada)": 0.4, "consulta (2 chamadas)": 0.4, "ação (3 chamadas)": 0.2}


def msg_cost_usd(profile, price, cached_share=0.0):
    inp = profile["in"] / 1e6
    in_cost = inp * ((1 - cached_share) * price["in"] + cached_share * price["cached"])
    return in_cost + profile["out"] / 1e6 * price["out"]


def mix_cost_usd(price, cached_share=0.0):
    return sum(msg_cost_usd(PROFILES[k], price, cached_share) * w for k, w in MIX.items())


def brl(usd):
    return usd * FX


print("== Custo de UMA mensagem do assistente ==")
for name, prof in PROFILES.items():
    print(f"  {name:24s} Luna sem cache: US$ {msg_cost_usd(prof, LUNA):.5f} = R$ {brl(msg_cost_usd(prof, LUNA)):.4f}")
avg_luna = mix_cost_usd(LUNA)
print(f"  MÉDIA (40/40/20)         Luna sem cache: R$ {brl(avg_luna):.4f}   com 80% em cache: R$ {brl(mix_cost_usd(LUNA, 0.8)):.4f}")
print(f"  MÉDIA                    Sol  sem cache: R$ {brl(mix_cost_usd(SOL)):.4f}  (referência: modelo maior)")
print(f"  100 mensagens (Luna): R$ {brl(avg_luna) * 100:.2f}")
voice_20s = TRANSCRIBE_PER_MIN * 20 / 60
print(f"  Voz 20 s: R$ {brl(voice_20s):.4f}; 60 s: R$ {brl(TRANSCRIBE_PER_MIN):.4f}")

# --- Arquétipos por plano --------------------------------------------------------------------------
PLANS = {
    # nome: preço, cota msgs/mês, uso típico (% da cota), visitas vitrine/mês, vendas/mês
    "Gratuito": dict(price=0.0, cap=15, util=0.4, visits=100),
    "Inicial": dict(price=29.99, cap=150, util=0.4, visits=500),
    "Pro": dict(price=49.99, cap=500, util=0.4, visits=3000),
    "Empresarial": dict(price=129.99, cap=1500, util=0.4, visits=10000),
}
VOICE_SHARE_TYPICAL = 0.3
VOICE_SECONDS_TYPICAL = 20
GATEWAY_PCT, GATEWAY_FIXED = 0.0399, 0.39  # Stripe BR cartão nacional (fonte de terceiros)
S3_SHARE = 0.3  # parte das imagens da vitrine servida do nosso S3 (o resto vem do catálogo)
MB_PER_VISIT = 1.0


def other_variable(visits):
    gb = visits * MB_PER_VISIT / 1024 * S3_SHARE
    return brl(gb * S3_EGRESS_GB) + 0.02  # + banco/e-mail/push (frações de centavo)


def ai_cost(cap, util, profile_mix=True, voice_share=VOICE_SHARE_TYPICAL, voice_s=VOICE_SECONDS_TYPICAL, cached=0.0):
    n = cap * util
    chat = n * brl(mix_cost_usd(LUNA, cached)) if profile_mix else n * brl(msg_cost_usd(PROFILES["ação (3 chamadas)"], LUNA, cached))
    voice = n * voice_share * brl(TRANSCRIBE_PER_MIN * voice_s / 60)
    return chat, voice


print("\n== Custo variável por cliente/mês (R$) ==")
print("plano        | IA chat | voz  | vitrine+outros | gateway | TOTAL típico | cota 100% (pior caso)")
rows = {}
for name, p in PLANS.items():
    chat, voice = ai_cost(p["cap"], p["util"])
    other = other_variable(p["visits"])
    gateway = 0.0 if p["price"] == 0 else p["price"] * GATEWAY_PCT + GATEWAY_FIXED
    total = chat + voice + other + gateway
    worst_chat, worst_voice = ai_cost(p["cap"], 1.0, profile_mix=False, voice_share=1.0, voice_s=30)
    worst = worst_chat + worst_voice + other + gateway
    rows[name] = dict(total=total, worst=worst, gateway=gateway, ai=chat + voice, other=other)
    print(f"{name:12s} | {chat:7.3f} | {voice:4.3f} | {other:14.3f} | {gateway:7.2f} | {total:12.2f} | {worst:8.2f}")

print("\n== Margem por plano ==")
for name, p in PLANS.items():
    r = rows[name]
    if p["price"] == 0:
        print(f"{name:12s} custo típico R$ {r['total']:.2f}/mês (sem receita); pior caso R$ {r['worst']:.2f}")
        continue
    contrib = p["price"] - r["total"]
    contrib_worst = p["price"] - r["worst"]
    print(
        f"{name:12s} preço {p['price']:6.2f} | contribuição típica {contrib:6.2f} ({contrib / p['price'] * 100:4.1f}%) "
        f"| pior caso {contrib_worst:6.2f} ({contrib_worst / p['price'] * 100:4.1f}%) | IA típica {r['ai']:.2f}"
    )

# --- Custos fixos e ponto de equilíbrio ------------------------------------------------------------
fixed_lean = brl(FLY_1GB) + 99 / 12 * FX + 5  # Fly 1 máquina + conta Apple Developer + domínio; bancos nos planos gratuitos
fixed_stable = 2 * brl(FLY_1GB) + brl(15) + brl(10) + 99 / 12 * FX + 5  # 2 máquinas, Neon pago, Redis pago
print(f"\n== Custos fixos/mês ==\n  Enxuto (1 máquina, Neon/Redis grátis): R$ {fixed_lean:.0f}\n  Estável (2 máquinas, Neon e Redis pagos): R$ {fixed_stable:.0f}")

# Equilíbrio: mix hipotético de pagantes 60% Inicial, 30% Pro, 10% Empresarial + gratuitos custando o típico
mix = {"Inicial": 0.6, "Pro": 0.3, "Empresarial": 0.1}
avg_contrib = sum(w * (PLANS[n]["price"] - rows[n]["total"]) for n, w in mix.items())
print(f"  Contribuição média por pagante (mix 60/30/10): R$ {avg_contrib:.2f}")
for label, fixed in (("enxuto", fixed_lean), ("estável", fixed_stable)):
    for free_per_paying in (0, 5, 10):
        free_cost = free_per_paying * rows["Gratuito"]["total"]
        n = (fixed) / (avg_contrib - free_cost) if avg_contrib - free_cost > 0 else float("inf")
        print(f"  Equilíbrio ({label}), {free_per_paying} gratuitos por pagante: {n:.1f} pagantes")

# --- Sensibilidade: trocar o modelo ou ligar raciocínio ---------------------------------------------
print("\n== Sensibilidade (custo da IA por cliente típico/mês, R$) ==")
for name, p in PLANS.items():
    n = p["cap"] * p["util"]
    luna = n * brl(mix_cost_usd(LUNA))
    luna_cache = n * brl(mix_cost_usd(LUNA, 0.8))
    sol = n * brl(mix_cost_usd(SOL))
    # raciocínio ligado: +1.500 tokens de saída por mensagem (estimativa)
    reasoning = n * brl(mix_cost_usd(LUNA) + 1500 / 1e6 * LUNA["out"])
    print(f"  {name:12s} Luna {luna:6.2f} | Luna c/ cache 80% {luna_cache:6.2f} | Luna c/ raciocínio {reasoning:6.2f} | Sol {sol:7.2f}")

print("\nTeto teórico de um abuso: 1 conta Empresarial gastando as 1.500 mensagens do mês só com 'ação' + voz 30 s:")
wc, wv = ai_cost(1500, 1.0, profile_mix=False, voice_share=1.0, voice_s=30)
print(f"  R$ {wc + wv:.2f}")
