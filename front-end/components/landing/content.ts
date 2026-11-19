// Textos, preços e links da landing num só lugar.

export const LINKS = {
  login: '/login',
  whatsapp:
    'https://wa.me/55XXXXXXXXXXX?text=' + // TODO: número do designer
    encodeURIComponent('Olá! Quero criar o layout das plaquinhas NFC do meu restaurante.'),
  whatsappLabel: '[(XX) XXXXX-XXXX]',
  contact: '[Contato · WhatsApp · E-mail]',
};

export const NAV = [
  { href: '#produto', label: 'Produto' },
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#plaquinhas', label: 'Plaquinhas' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'Dúvidas' },
];

export const STEPS = [
  'O cliente aproxima o celular da plaquinha.',
  'Escolhe: chamar o garçom, pedir a conta ou ver o cardápio.',
  'O garçom recebe o chamado na hora, no painel.',
];

export const MANIFESTO =
  'O Psiu conecta a mesa ao salão. O cliente chama o garçom, pede a conta ou abre o cardápio com um toque. Sua equipe atende sem ruído, e você enxerga cada atendimento.';

export const PACKS = [
  { name: 'Pacote inicial', qty: 10, unit: 'R$ 24,90', price: 'R$ 249' },
  { name: 'Pacote salão', qty: 20, unit: 'R$ 22,45', price: 'R$ 449' },
  { name: 'Pacote casa cheia', qty: 40, unit: 'R$ 19,98', price: 'R$ 799' },
];

export const PLANS = [
  {
    name: 'Essencial',
    desc: 'Para organizar os chamados do salão.',
    price: 89,
    note: 'Preço de lançamento',
    items: [
      'Chamado de garçom por NFC',
      'Painel de chamados em tempo real',
      'Gestão de garçons e funções',
      'Cadastro de mesas e QR Code',
      'Preço de assinante nos pacotes de plaquinhas',
    ],
  },
  {
    name: 'Completo',
    desc: 'Para gerir o restaurante inteiro.',
    price: 149,
    note: 'Preço de lançamento garantido para quem assinar agora',
    featured: true,
    items: [
      'Tudo do Essencial',
      'PDV integrado aos chamados',
      'Cardápio digital personalizável',
      'Dashboard de métricas e balanços',
      'Mais 10% de desconto nos pacotes de plaquinhas',
    ],
  },
];

export const FAQ = [
  ['O cliente precisa baixar algum aplicativo?', 'Não. Ao aproximar o celular da plaquinha, o Psiu abre direto no navegador.'],
  ['Funciona em qualquer celular?', 'Funciona em celulares com NFC. Para os que não têm, a plaquinha também traz um QR Code.'],
  ['Quanto custam as plaquinhas?', 'Os pacotes vão de R$ 249 (10 unidades) a R$ 799 (40 unidades). Assinantes do Completo têm mais 10% de desconto, e a criação do layout não tem custo extra.'],
  ['Quanto custa criar o layout das plaquinhas?', 'Nada a mais. O designer do Psiu cria o layout com você pelo WhatsApp e você paga só as plaquinhas.'],
  ['Qual o prazo de entrega das plaquinhas?', '[Prazo de produção e entrega]'],
  ['Posso trocar de plano depois?', '[Regra de troca de plano]'],
  ['Em qual plano estão o PDV e o cardápio digital?', 'No plano Completo, junto com o dashboard de métricas e balanços.'],
  ['Já tenho conta. Onde entro?', 'Use o botão Entrar no topo da página para acessar o painel.'],
] as const;
