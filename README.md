# Link de avaliação do Google (sem API paga)

Você digita o nome do estabelecimento, como aparece no Google Maps, e recebe:

```
https://search.google.com/local/writereview?placeid=<PLACE ID DO LOCAL>
```

Roda de graça no **GitHub Actions**. Não precisa de chave de API nem de cartão no Google Cloud.

## Jeito mais rápido: a página

**https://leofreitas09.github.io/link-avaliacao/**

Digite nome e cidade, abra a busca no Google Maps, clique no estabelecimento certo,
copie o endereço da página do Maps e cole na página. O link sai na hora.
O código fica em `docs/index.html`.

## Como funciona

Um robô (Playwright) faz o mesmo caminho que você faria à mão:

1. Abre o **Place ID Finder** do Google
2. Digita o nome na caixa de busca
3. Seleciona o resultado (por padrão, o 1º da lista)
4. Lê o **Place ID** que aparece no balão do mapa
5. Monta o link de avaliação e mostra na tela

## Instalação (uma vez só)

1. Crie um repositório no GitHub (ex.: `link-avaliacao`).
2. Envie **todos os arquivos mantendo as pastas** (`.github/`, `scripts/`, `package.json`).
   O jeito mais fácil: arraste o conteúdo da pasta para **Add file → Upload files**.
3. Pronto. Não há mais nada para configurar.

## Como usar

1. No repositório, abra a aba **Actions**.
2. Clique em **Gerar link de avaliação do Google** (menu à esquerda).
3. Clique em **Run workflow**, digite o nome (ex.: `Krav Maga Caveira Valinhos`) e confirme.
4. Espere cerca de 1 minuto, abra a execução que apareceu e role até o **Summary**.
   O link está lá, pronto para copiar.

### Vários de uma vez
No campo do nome, escreva um estabelecimento por linha. O Summary mostra um link para cada um.

### O resultado veio errado?
O Summary lista os outros resultados da busca. Rode de novo com o campo
**Qual resultado usar** = `2`, `3`…

## Se der erro

Na página da execução, baixe o item **resultado** (em *Artifacts*). Ele guarda um print do que o robô viu.

| Erro | O que fazer |
|---|---|
| "Não encontrei a caixa de busca" | O Google pode ter mudado a página de demonstração. Me mande o print do erro que eu ajusto o script |
| "Timeout" ao ler o Place ID | Rode de novo. Se persistir, inclua a cidade no nome |

## Observações

- Isso automatiza uma página de **demonstração** do Google. Ela não é uma API oficial, então pode mudar ou parar sem aviso. Para uso leve e pessoal funciona bem. Para volume alto, a API oficial é o caminho seguro.
- O repositório pode ser privado. O GitHub Actions dá minutos gratuitos por mês, e cada busca usa cerca de 1 minuto.
