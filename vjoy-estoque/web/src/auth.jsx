import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { get, post, salvarToken, token, definirAoExpirar } from './api.js';
import { conectar, desconectar } from './realtime.js';

const Ctx = createContext(null);
export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState({ carregando: !!token(), usuario: null, permissoes: {} });
  const sair = useCallback(() => { salvarToken(null); desconectar(); setSessao({ carregando: false, usuario: null, permissoes: {} }); }, []);
  const carregar = useCallback(async () => {
    try { const me = await get('/me'); setSessao({ carregando: false, ...me }); conectar(); }
    catch { sair(); }
  }, [sair]);
  useEffect(() => { definirAoExpirar(sair); if (token()) carregar(); }, [carregar, sair]);
  const entrar = async (login, senha) => { const r = await post('/login', { login, senha }); salvarToken(r.token); await carregar(); };
  const pode = (p) => !!sessao.permissoes?.[p];
  return <Ctx.Provider value={{ ...sessao, entrar, sair, pode }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
