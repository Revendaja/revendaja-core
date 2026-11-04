"""Custo por cliente com canais de venda (Stripe, Apple, Google Play) e imposto do MEI.

Complementa docs/cost_model.py (que assume tudo pela Stripe e não tem MEI). As premissas de IA,
voz, vitrine e infraestrutura são as mesmas; aqui entram as comissões por canal e o DAS do MEI.
"""

FX = 5.40
LUNA_IN, LUNA_OUT = 0.10, 0.50
TRANSCRIBE_PER_MIN = 0.0045

# Mensagem média (mix 40/40/20 de simples/consulta/ação), sem cache.
PROFILES = [(0.4, 5_700, 150), (0.4, 11_900, 260), (0.2, 18_500, 420)]
AVG_MSG_USD = sum(w * (i / 1e6 * LUNA_IN + o / 1e6 * LUNA_OUT) for w, i, o in PROFILES)
HEAVY_MSG_USD = 18_500 / 1e6 * LUNA_IN + 420 / 1e6 * LUNA_OUT

PLANS = {  # preço, cota de IA, visitas/mês
    "Inicial": (29.99, 150, 500),
    "Pro": (49.99, 500, 3000),
    "Empresarial": (129.99, 1500, 10000),
}
UTIL, VOICE_SHARE, VOICE_S = 0.4, 0.3, 20

CHANNELS = {  # comissão %, fixo R$
    "Stripe": (3.99, 0.39),
    "Apple": (15.0, 0.0),
    "Google Play": (15.0, 0.0),
}
SCENARIOS = {
    "Tudo pela Stripe": {"Stripe": 1.0, "Apple": 0.0, "Google Play": 0.0},
    "Divisão padrão do painel (30/20/50)": {"Stripe": 0.3, "Apple": 0.2, "Google Play": 0.5},
    "Tudo pelas lojas (50/50)": {"Stripe": 0.0, "Apple": 0.5, "Google Play": 0.5},
}

MEI_DAS = 81.05 + 5.00  # INSS 5% do salário mínimo de 2026 + ISS (serviços)
MEI_ANNUAL_LIMIT = 81_000


def fee(price, mix):
    return sum(share * (price * CHANNELS[c][0] / 100 + CHANNELS[c][1]) for c, share in mix.items())


def other_costs(price, cap, visits):
    msgs = cap * UTIL
    ai = msgs * AVG_MSG_USD * FX
    voice = msgs * VOICE_SHARE * (TRANSCRIBE_PER_MIN * VOICE_S / 60) * FX
    egress = visits * 1.0 / 1024 * 0.3 * 0.09 * FX + 0.02
    return ai + voice + egress


fixed_lean = 6.70 * FX + 99 / 12 * FX + 5 + MEI_DAS
print(f"Custos fixos enxutos com o DAS do MEI: R$ {fixed_lean:.2f} (sem o MEI: R$ {fixed_lean - MEI_DAS:.2f})\n")

for name, mix in SCENARIOS.items():
    print(f"== {name} ==")
    contribs = {}
    for plan, (price, cap, visits) in PLANS.items():
        f = fee(price, mix)
        total = other_costs(price, cap, visits) + f
        contribs[plan] = price - total
        print(f"  {plan:12s} preço {price:7.2f} | comissão {f:6.2f} ({f / price * 100:4.1f}%) | custo {total:6.2f} | sobra {price - total:6.2f} ({(price - total) / price * 100:4.1f}%)")
    avg = 0.6 * contribs["Inicial"] + 0.3 * contribs["Pro"] + 0.1 * contribs["Empresarial"]
    print(f"  contribuição média por pagante (60/30/10): R$ {avg:.2f}")
    print(f"  assinantes para cobrir o fixo (R$ {fixed_lean:.0f}): {fixed_lean / avg:.1f} | com salário de R$ 3.000: {(fixed_lean + 3000) / avg:.0f}")
    print()

print("Limite do MEI (R$ 81.000/ano = R$ 6.750/mês de mensalidades):")
for name, mix in SCENARIOS.items():
    contribs = []
    for plan, (price, cap, visits) in PLANS.items():
        contribs.append(price - fee(price, mix) - other_costs(price, cap, visits))
    avg = 0.6 * contribs[0] + 0.3 * contribs[1] + 0.1 * contribs[2]
    avg_price = 0.6 * 29.99 + 0.3 * 49.99 + 0.1 * 129.99
    subs_at_limit = (MEI_ANNUAL_LIMIT / 12) / avg_price
    print(f"  mensalidade média {avg_price:.2f}: o teto chega com ~{subs_at_limit:.0f} assinantes ({name})")
