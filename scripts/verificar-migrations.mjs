// Verifica as regras do banco em toda migration, antes de qualquer revisão humana:
// - tabela nova tem RLS ligado e GRANT ou REVOKE explícito para anon e authenticated;
// - função SECURITY DEFINER tem SET search_path = '';
// - ALTER TYPE ... ADD VALUE fica sozinho na sua migration;
// - nada é criado ou alterado fora dos schemas deste repositório (as tabelas do site ficam intocadas).
//
// Uso: node scripts/verificar-migrations.mjs supabase/migrations

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Schemas em que este repositório pode criar e alterar objetos.
export const SCHEMAS_PERMITIDOS = ['oportunidades', 'vitrine']

const NOME_ARQUIVO = /^\d{14}_[a-z0-9_]+\.sql$/
const NOME = String.raw`(?:"[^"]+"|[a-z_][a-z0-9_$]*)(?:\.(?:"[^"]+"|[a-z_][a-z0-9_$]*))*`
const LISTA_DE_NOMES = String.raw`${NOME}(?:\s*,\s*${NOME})*`

// Remove comentários, troca o texto de strings por um marcador e esvazia corpos de função.
// Strings vazias continuam vazias, para que SET search_path = '' siga reconhecível.
export function limparSql(sql) {
  let saida = ''
  let i = 0
  while (i < sql.length) {
    const resto = sql.slice(i)
    if (resto.startsWith('--')) {
      const fim = sql.indexOf('\n', i)
      i = fim === -1 ? sql.length : fim
      continue
    }
    if (resto.startsWith('/*')) {
      const fim = sql.indexOf('*/', i + 2)
      i = fim === -1 ? sql.length : fim + 2
      continue
    }
    const dolar = /^\$([a-z_][a-z0-9_]*)?\$/i.exec(resto)
    if (dolar) {
      const fim = sql.indexOf(dolar[0], i + dolar[0].length)
      saida += ' $corpo$ '
      i = fim === -1 ? sql.length : fim + dolar[0].length
      continue
    }
    if (sql[i] === "'") {
      const comEscape = /e/i.test(sql[i - 1] ?? '')
      let j = i + 1
      let conteudo = ''
      while (j < sql.length) {
        if (comEscape && sql[j] === '\\') {
          conteudo += sql.slice(j, j + 2)
          j += 2
          continue
        }
        if (sql[j] === "'" && sql[j + 1] === "'") {
          conteudo += "''"
          j += 2
          continue
        }
        if (sql[j] === "'") break
        conteudo += sql[j]
        j += 1
      }
      saida += conteudo.length === 0 ? "''" : "'texto'"
      i = j + 1
      continue
    }
    saida += sql[i]
    i += 1
  }
  return saida
}

export function separarComandos(sql) {
  return limparSql(sql)
    .split(';')
    .map((comando) => comando.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((comando) => comando.length > 0)
}

function partes(nome) {
  return nome.split('.').map((parte) => parte.replace(/^"|"$/g, ''))
}

function nomesDaLista(lista) {
  return lista.split(',').map((nome) => nome.trim())
}

// Cada tipo de comando aceito, com os objetos que ele cria ou altera.
// `tipo` decide como o nome é lido: 'objeto' (schema.nome), 'schema' (só o schema)
// ou 'coluna' (schema.tabela.coluna).
const COMANDOS = [
  { padrao: new RegExp(String.raw`^create schema (?:if not exists )?(${NOME})`), tipo: 'schema' },
  { padrao: new RegExp(String.raw`^create type (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^create (?:or replace )?function (${NOME})\s*\(`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^create (?:or replace )?view (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^create (?:unlogged )?table (?:if not exists )?(${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^create (?:unique )?index (?:concurrently )?(?:if not exists )?${NOME} on (?:only )?(${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^create (?:or replace )?(?:constraint )?trigger ${NOME} .* on (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^(?:create|alter|drop) policy (?:if exists )?.* on (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^alter table (?:if exists )?(?:only )?(${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^alter type (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^alter function (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^drop (?:table|view|type|function|index) (?:if exists )?(${LISTA_DE_NOMES})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^drop schema (?:if exists )?(${NOME})`), tipo: 'schema' },
  { padrao: new RegExp(String.raw`^truncate (?:table )?(?:only )?(${LISTA_DE_NOMES})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^insert into (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^update (?:only )?(${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^delete from (?:only )?(${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^comment on schema (${NOME})`), tipo: 'schema' },
  { padrao: new RegExp(String.raw`^comment on column (${NOME})`), tipo: 'coluna' },
  { padrao: new RegExp(String.raw`^comment on (?:table|view|type|function|index) (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^(?:grant|revoke) .* on schema (${LISTA_DE_NOMES}) (?:to|from) `), tipo: 'schema' },
  { padrao: new RegExp(String.raw`^(?:grant|revoke) .* on all (?:tables|functions|sequences) in schema (${LISTA_DE_NOMES}) (?:to|from) `), tipo: 'schema' },
  { padrao: new RegExp(String.raw`^(?:grant|revoke) .* on (?:function|sequence) (${NOME})`), tipo: 'objeto' },
  { padrao: new RegExp(String.raw`^(?:grant|revoke) .* on (?:table )?(${LISTA_DE_NOMES}) (?:to|from) `), tipo: 'objeto' },
]

function schemaDoAlvo(nome, tipo) {
  const p = partes(nome)
  if (tipo === 'schema') return p[0]
  if (tipo === 'coluna') return p.length === 3 ? p[0] : null
  return p.length === 2 ? p[0] : null
}

export function verificarSql(arquivo, sql) {
  const problemas = []
  const comandos = separarComandos(sql)
  const tabelasCriadas = []
  const tabelasComRls = new Set()
  const papeisPorTabela = new Map()
  const papeisPorSchema = new Map()

  if (!NOME_ARQUIVO.test(arquivo)) {
    problemas.push(`o nome do arquivo deve seguir AAAAMMDDHHMMSS_descricao.sql`)
  }

  for (const comando of comandos) {
    const regra = COMANDOS.find(({ padrao }) => padrao.test(comando))
    if (!regra) {
      problemas.push(`comando não reconhecido pelo verificador: "${comando.slice(0, 60)}"`)
      continue
    }

    const alvos = nomesDaLista(regra.padrao.exec(comando)[1])
    for (const alvo of alvos) {
      const schema = schemaDoAlvo(alvo, regra.tipo)
      if (schema === null) {
        problemas.push(`use o nome completo (schema.nome) em "${comando.slice(0, 60)}"`)
      } else if (!SCHEMAS_PERMITIDOS.includes(schema)) {
        problemas.push(`"${alvo}" está fora dos schemas deste repositório (${SCHEMAS_PERMITIDOS.join(', ')})`)
      }
    }

    if (/^create (?:unlogged )?table /.test(comando)) {
      tabelasCriadas.push(alvos[0])
    }

    if (/^alter table .* enable row level security$/.test(comando)) {
      tabelasComRls.add(alvos[0])
    }

    const permissao = /^(?:grant|revoke) .* (?:to|from) (.+)$/.exec(comando)
    if (permissao) {
      const papeis = permissao[1]
        .replace(/ (?:with grant option|cascade|restrict)$/, '')
        .split(',')
        .map((papel) => papel.trim())
      const emSchema = / on all tables in schema /.test(comando)
      const destino = emSchema ? papeisPorSchema : papeisPorTabela
      if (emSchema || / on (?:table )?(?!schema |function |sequence |all )/.test(comando)) {
        for (const alvo of alvos) {
          destino.set(alvo, new Set([...(destino.get(alvo) ?? []), ...papeis]))
        }
      }
    }

    if (/^create (?:or replace )?function /.test(comando) && / security definer( |$)/.test(comando)) {
      if (!/ set search_path (?:=|to) ''( |$)/.test(comando)) {
        problemas.push(`a função ${alvos[0]} é SECURITY DEFINER e precisa de SET search_path = ''`)
      }
    }

    if (/^alter type .* add value /.test(comando) && comandos.length > 1) {
      problemas.push(`ALTER TYPE ... ADD VALUE precisa ficar sozinho numa migration`)
    }
  }

  for (const tabela of tabelasCriadas) {
    if (!tabelasComRls.has(tabela)) {
      problemas.push(`a tabela ${tabela} precisa de ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
    }
    const papeis = new Set([
      ...(papeisPorTabela.get(tabela) ?? []),
      ...(papeisPorSchema.get(partes(tabela)[0]) ?? []),
    ])
    for (const papel of ['anon', 'authenticated']) {
      if (!papeis.has(papel)) {
        problemas.push(`a tabela ${tabela} precisa de GRANT ou REVOKE explícito para ${papel}`)
      }
    }
  }

  return problemas
}

export function verificarPasta(pasta) {
  const arquivos = readdirSync(pasta).filter((arquivo) => arquivo.endsWith('.sql')).sort()
  return arquivos.flatMap((arquivo) =>
    verificarSql(arquivo, readFileSync(join(pasta, arquivo), 'utf8')).map((problema) => `${arquivo}: ${problema}`),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const pasta = process.argv[2] ?? 'supabase/migrations'
  const problemas = verificarPasta(pasta)
  if (problemas.length > 0) {
    console.error(problemas.join('\n'))
    process.exit(1)
  }
  console.log(`Migrations em ${pasta}: todas as regras do banco foram cumpridas.`)
}
