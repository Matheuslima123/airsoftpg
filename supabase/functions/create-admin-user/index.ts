import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405);
  }

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: caller, error: authError } = await supabase.auth.getUser(token);
  if (authError || !caller.user) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const { action, ...payload } = await req.json();

  if (action === 'list') {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return json({ error: error.message }, 400);
    const users = (data?.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      nome: u.user_metadata?.nome || '',
      criado: u.created_at,
      confirmado: !!u.email_confirmed_at
    }));
    return json({ ok: true, users }, 200);
  }

  if (action === 'create') {
    const { nome, email, password } = payload;
    if (!email || !password || password.length < 6) {
      return json({ error: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' }, 400);
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: nome || '' }
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, id: data.user.id }, 201);
  }

  if (action === 'reset-password') {
    const { id, password } = payload;
    if (!id || !password || password.length < 6) {
      return json({ error: 'Informe o usuário e a nova senha (mínimo 6 caracteres).' }, 400);
    }
    const { data, error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true }, 200);
  }

  return json({ error: 'Ação desconhecida.' }, 400);
});
