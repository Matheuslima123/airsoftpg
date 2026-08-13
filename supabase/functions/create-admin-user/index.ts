import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: caller, error: authError } = await supabase.auth.getUser(token);
  if (authError || !caller.user) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { nome, email, password } = await req.json();
  if (!email || !password || password.length < 6) {
    return new Response(
      JSON.stringify({ error: 'E-mail e senha (mínimo 6 caracteres) são obrigatórios.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: nome || '' }
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true, id: data.user.id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
});
