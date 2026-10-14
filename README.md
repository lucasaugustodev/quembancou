# Quem Bancou

Transparência do financiamento eleitoral em [quembancou.com](https://quembancou.com), com dados públicos do Tribunal Superior Eleitoral.

O recorte reúne os 50 deputados federais, os 50 candidatos ao Senado e os 5 presidenciáveis mais votados no primeiro turno de 2026, incluindo eleitos e não eleitos. As contas deste snapshot foram extraídas em 14/10/2026 e refletem declarações de datas diferentes; ainda são parciais ou relatórios financeiros.

## Publicação

O conteúdo estático está em `dist/`. Cada push na branch `main` valida as metatags e os assets e publica essa pasta no GitHub Pages. O domínio é `quembancou.com`.

Os perfis têm URLs próprias em `/candidatos/<id>/`, metatags Open Graph e Twitter e imagens de compartilhamento de 1200×630. Há favicon, ícones Apple/PWA, canonical, sitemap e robots.txt.

## Dados e fontes

- [Resultados eleitorais de 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026).
- [Prestação de contas eleitorais de 2026](https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2026).
- [Fotos oficiais das candidaturas](https://dadosabertos.tse.jus.br/dataset/candidatos-2026).

Os valores são armazenados em centavos. Pagamentos e despesas contratadas são separados; parcelas não são repetidas em cada item de despesa. O ranking de pessoas físicas considera doações financeiras diretas no recorte. Repasses partidários, recursos próprios, financiamento coletivo intermediado e rendimentos não entram nesse ranking.

O indicador de impulsionamento por voto divide pagamentos declarados pelos votos do primeiro turno e usa mais votos como desempate. É um indicador descritivo; as datas das contas podem incluir despesas posteriores à votação.

As fontes, datas e metodologia estão na dashboard e em cada perfil. CPF e CNPJ não são publicados. A soma de declarações não é o custo nacional das eleições.

## Reprodução

Os scripts em `scripts/` selecionam candidatos, extraem contas, obtêm retratos oficiais e geram SEO e imagens de compartilhamento. Os downloads temporários em `research/` são ignorados pelo Git. Imagens de compartilhamento são renderizadas de HTML/SVG por Chrome via CDP, preservando o desenho nativo da marca.

Para validar o site já gerado:

```sh
node scripts/verify_seo.mjs
```

Os dados deste repositório são um snapshot; publicar o site não atualiza automaticamente as contas do TSE.
