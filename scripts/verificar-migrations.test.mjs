import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { limparSql, verificarPasta, verificarSql } from './verificar-migrations.mjs'

const ARQUIVO = '20261028000000_teste.sql'

const TABELA_CORRETA = `
  create table oportunidades.exemplo (id uuid primary key);
  alter table oportunidades.exemplo enable row level security;
  revoke all on table oportunidades.exemplo from anon, authenticated;
  grant select on table oportunidades.exemplo to service_role;
`

describe('limparSql', () => {
  it('remove comentários e esvazia corpos de função', () => {
    const limpo = limparSql("-- comentário; com ponto e vírgula\nselect 1; /* outro; */ $$ begin; end; $$")
    assert.ok(!limpo.includes('comentário'))
    assert.ok(!limpo.includes('outro'))
    assert.ok(!limpo.includes('begin'))
  })

  it('mantém strings vazias e marca as demais', () => {
    assert.equal(limparSql("set search_path = ''"), "set search_path = ''")
    assert.equal(limparSql("set search_path = 'public'"), "set search_path = 'texto'")
  })
})

describe('verificarSql', () => {
  it('aceita uma tabela com RLS e permissões explícitas', () => {
    assert.deepEqual(verificarSql(ARQUIVO, TABELA_CORRETA), [])
  })

  it('exige o padrão de nome do arquivo', () => {
    assert.match(verificarSql('01_teste.sql', TABELA_CORRETA).join(), /nome do arquivo/)
  })

  it('recusa tabela sem RLS', () => {
    const sql = TABELA_CORRETA.replace(/alter table .* enable row level security;/, '')
    assert.match(verificarSql(ARQUIVO, sql).join(), /ENABLE ROW LEVEL SECURITY/)
  })

  it('recusa tabela sem permissão explícita para anon', () => {
    const sql = TABELA_CORRETA.replace('from anon, authenticated', 'from authenticated')
    assert.match(verificarSql(ARQUIVO, sql).join(), /explícito para anon/)
  })

  it('aceita permissões dadas para o schema inteiro', () => {
    const sql = `
      create table oportunidades.exemplo (id uuid primary key);
      alter table oportunidades.exemplo enable row level security;
      revoke all on all tables in schema oportunidades from anon, authenticated;
    `
    assert.deepEqual(verificarSql(ARQUIVO, sql), [])
  })

  it('recusa SECURITY DEFINER sem search_path vazio', () => {
    const sql = `
      create function oportunidades.f() returns void language sql security definer
      set search_path = public as $$ select 1; $$;
    `
    assert.match(verificarSql(ARQUIVO, sql).join(), /search_path/)
  })

  it('aceita SECURITY DEFINER com search_path vazio', () => {
    const sql = `
      create function oportunidades.f() returns void language sql security definer
      set search_path = '' as $$ select 1; $$;
    `
    assert.deepEqual(verificarSql(ARQUIVO, sql), [])
  })

  it('recusa ALTER TYPE ADD VALUE junto com outros comandos', () => {
    const sql = `alter type oportunidades.tipo_item add value 'outro'; comment on type oportunidades.tipo_item is 'x';`
    assert.match(verificarSql(ARQUIVO, sql).join(), /sozinho/)
  })

  it('aceita ALTER TYPE ADD VALUE sozinho', () => {
    assert.deepEqual(verificarSql(ARQUIVO, `alter type oportunidades.tipo_item add value 'outro';`), [])
  })

  it('recusa qualquer alteração em tabelas do site', () => {
    for (const sql of [
      'alter table public.habilidades add column x text;',
      'drop table public.vagas;',
      'create policy p on public.users for select using (true);',
      'insert into public.habilidades (nome) values (1);',
      'update public.users set nome = 1;',
      'delete from public.vagas;',
      'grant select on table public.users to anon;',
      'create trigger t after insert on public.users for each row execute function oportunidades.f();',
      'truncate public.vagas;',
    ]) {
      assert.match(verificarSql(ARQUIVO, sql).join(), /fora dos schemas/, sql)
    }
  })

  it('recusa nomes sem schema', () => {
    assert.match(verificarSql(ARQUIVO, 'alter table habilidades add column x text;').join(), /nome completo/)
  })

  it('recusa comandos que o verificador não conhece', () => {
    assert.match(verificarSql(ARQUIVO, 'select 1;').join(), /não reconhecido/)
  })

  it('aceita tarefa do agendador com nome próprio que chama uma função nossa', () => {
    const sql = `
      select cron.schedule('oportunidades-coletar', '*/30 * * * *', 'select oportunidades.chamar_coleta()');
      select cron.unschedule('oportunidades-antiga');
    `
    assert.deepEqual(verificarSql(ARQUIVO, sql), [])
  })

  it('recusa tarefa do agendador fora do padrão', () => {
    for (const [sql, erro] of [
      [`select cron.schedule('limpar', '0 3 * * *', 'select oportunidades.f()');`, /nome "oportunidades-/],
      [`select cron.unschedule('newsletter-expirar-itens');`, /nome "oportunidades-/],
      [`select cron.schedule('oportunidades-x', '0 3 * * *', 'delete from public.vagas');`, /só pode chamar/],
      [`select cron.schedule('oportunidades-x', '0 3 * * *', $$select oportunidades.f()$$);`, /aspas simples/],
    ]) {
      assert.match(verificarSql(ARQUIVO, sql).join(), erro, sql)
    }
  })

  it('permite apontar para tabelas do site sem alterá-las', () => {
    const sql = TABELA_CORRETA.replace('(id uuid primary key)', '(id uuid primary key references public.habilidades (id))')
    assert.deepEqual(verificarSql(ARQUIVO, sql), [])
  })
})

describe('migrations do repositório', () => {
  it('cumprem todas as regras', () => {
    const pasta = fileURLToPath(new URL('../supabase/migrations', import.meta.url))
    assert.deepEqual(verificarPasta(pasta), [])
  })
})
