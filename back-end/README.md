# Garçom NFC - back-end

Sistema para o cliente chamar o garçom ou pedir a conta direto da mesa, encostando o celular numa plaquinha NFC ou lendo um QR code. Não precisa instalar app nem criar conta.

## Como funciona

O dono do restaurante se cadastra e vira admin. Ele cadastra os garçons e as mesas. Cada mesa ganha um código, e esse código vira um link que vai gravado na plaquinha.

Quando o cliente senta, o garçom abre a mesa no sistema. O cliente encosta o celular, a página da mesa abre e ele pode chamar o garçom ou pedir a conta. O chamado aparece na hora no painel dos garçons.

Quando o cliente vai embora, o garçom fecha a mesa e o link para de funcionar até a próxima abertura.

## Usuários

- Admin: dono do restaurante. Gerencia garçons e mesas.
- Staff: garçom. Abre e fecha mesas e atende os chamados.
- Cliente: não tem conta. Só usa a mesa enquanto ela estiver aberta.

## Stack

Node.js, Express, TypeScript, Prisma e PostgreSQL. Autenticação do staff com JWT.

## Cardápio e pedidos

O backend contempla catálogo editável, publicações, mídia local, envio de pedidos, andamento parcial, auditoria e permissões por categoria. Novos restaurantes recebem cardápio vazio e pedidos pelo cliente desabilitados na mesma transação do cadastro. Os contratos estão no Swagger e na [documentação técnica](../docs/Documentacao-Tecnica-garcom-NFC.pdf); as telas ficam para a etapa de frontend.

Detalhes de integração e operação estão na documentação técnica. Armazenamento local persistente nesta versão; bucket Amazon S3 como evolução futura, sem dependência obrigatória de AWS no deploy inicial.
