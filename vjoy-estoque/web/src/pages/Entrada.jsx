import { useCallback, useEffect, useState } from 'react';
import Scanner from '../components/Scanner.jsx';
import { Resultado, useDialog } from '../components/ui.jsx';
import { get, post, ApiError } from '../api.js';
import { feedback } from '../feedback.js';
import { fmtDataHora } from '../util.js';

const lerPref = () => { try { return localStorage.getItem('vjoy_exigir_cliente') === '1'; } catch { return false; } };
const PARECE_CLIENTE = /^CLI\d+$/i;

export default function Entrada() {
  const dialog = useDialog();
  const [cliente, setCliente] = useState(null);
  const [res, setRes] = useState(null);
  const [qtd, setQtd] = useState(1);
  const [recentes, setRecentes] = useState([]);
  const [exigir, setExigir] = useState(lerPref());

  const carregarRecentes = useCallback(() => get('/entrada/recentes').then(setRecentes).catch(() => {}), []);
  useEffect(() => { carregarRecentes(); }, [carregarRecentes]);

  const mostrar = (nivel, titulo, linhas = [], sub) => {
    feedback(nivel);
    setRes({ nivel, titulo, linhas, chave: Date.now() });
    return { nivel, titulo, sub: sub ?? (typeof linhas[0] === 'string' ? linhas[0] : linhas[0]?.texto) };
  };

  const identificarCliente = async (codigo) => {
    try {
      const c = await get('/clientes/codigo/' + encodeURIComponent(codigo));
      setCliente(c);
      return mostrar('SUCESSO', 'CLIENTE IDENTIFICADO', [c.nome, { texto: `📍 RUA ${c.rua}`, destaque: true },
        c.pendente_receber?.unidades ? `${c.pendente_receber.unidades} un. pendentes de entrada em pedidos` : 'Sem pedidos pendentes de entrada'], `📍 RUA ${c.rua}`);
    } catch (e) {
      return mostrar('ERRO', e.codigo === 'CLIENTE_SEM_RUA' ? 'CLIENTE SEM RUA' : 'CLIENTE NÃO IDENTIFICADO', [e.message]);
    }
  };

  const registrar = async (cli, codigo, extra = {}) => {
    try {
      const r = await post('/entrada', { cliente: cli.codigo_barras, produto: codigo, quantidade: qtd, ...extra });
      setQtd(1);
      carregarRecentes();
      if (exigir) setCliente(null);
      const linhas = [
        `${r.produto.codigo} — ${r.produto.descricao}`,
        `${r.quantidade > 1 ? r.quantidade + ' unidades · ' : ''}Cliente: ${r.cliente.nome}`,
        { texto: `📍 Coloque na RUA ${r.cliente.rua}`, destaque: true },
        r.pedido ? `Pedido ${r.pedido.numero}: ${r.pedido.recebido}/${r.pedido.pedida} recebidos` : 'Sem pedido (estoque livre)',
      ];
      return mostrar(r.nivel, r.nivel === 'SUCESSO' ? 'PRODUTO REGISTRADO NO ESTOQUE' : 'REGISTRADO COM ALERTA', r.nivel === 'ALERTA' ? [r.mensagem, ...linhas] : linhas, `RUA ${r.cliente.rua} · ${r.produto.codigo}`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.codigo === 'CONFIRMAR') return tratarConfirmacao(cli, codigo, e, extra);
      if (e.status === 403 && extra.autorizacao) return mostrar('ERRO', 'AUTORIZAÇÃO RECUSADA', [e.message]);
      return mostrar('ERRO', { CODIGO_INEXISTENTE: 'CÓDIGO NÃO CADASTRADO', CLIENTE_SEM_RUA: 'CLIENTE SEM RUA' }[e.codigo] || 'ERRO NA ENTRADA', [e.message]);
    }
  };

  const tratarConfirmacao = async (cli, codigo, e, extra) => {
    feedback('ALERTA');
    const d = e.dados || {};
    const sugeridos = d.clientesSugeridos || [];
    const trocas = sugeridos.map((s) => ({ valor: 'trocar:' + s.codigo, texto: `Trocar para ${s.nome}${s.rua ? ' (' + s.rua + ')' : ''}`, classe: 'btn-primario' }));
    const titulos = { EXCEDENTE: 'Quantidade acima do pedido', SEM_PEDIDO: 'Produto sem pedido', CLIENTE_DIVERGENTE: 'Cliente diferente do pedido' };
    const escolha = await dialog({
      titulo: '⚠️ ATENÇÃO — ' + (titulos[d.tipo] || 'Confirme'),
      mensagem: <><p>{e.message}</p>{d.tipo === 'CLIENTE_DIVERGENTE' && <p><b>Deseja continuar com {cli.nome}?</b> Exige autorização.</p>}</>,
      confirmar: d.tipo === 'CLIENTE_DIVERGENTE' ? `Continuar com ${cli.nome}` : 'Registrar mesmo assim',
      extras: trocas,
    });
    if (!escolha) return mostrar('ALERTA', 'ENTRADA NÃO REGISTRADA', ['Operação cancelada pelo operador.']);
    if (typeof escolha === 'string' && escolha.startsWith('trocar:')) {
      try {
        const novo = await get('/clientes/codigo/' + encodeURIComponent(escolha.slice(7)));
        setCliente(novo);
        return registrar(novo, codigo);
      } catch (err) { return mostrar('ERRO', 'NÃO FOI POSSÍVEL TROCAR O CLIENTE', [err.message]); }
    }
    let autorizacao;
    if (d.precisaAutorizacao) {
      autorizacao = await dialog({ tipo: 'autorizacao', mensagem: `Registrar ${codigo} no cliente ${cli.nome} (rua ${cli.rua}) apesar da divergência.` });
      if (!autorizacao) return mostrar('ALERTA', 'ENTRADA NÃO REGISTRADA', ['Autorização cancelada.']);
    }
    return registrar(cli, codigo, { ...extra, confirmar: d.tipo, autorizacao });
  };

  const onLeitura = async (codigo) => {
    if (!cliente) return identificarCliente(codigo);
    if (PARECE_CLIENTE.test(codigo) || codigo.toUpperCase() === cliente.codigo_barras) return identificarCliente(codigo);
    return registrar(cliente, codigo);
  };

  return (
    <div className="pagina pagina-op">
      <div className="passos">
        <div className={'passo ' + (cliente ? 'feito' : 'ativo')}><span>1</span> Bipar cliente</div>
        <div className={'passo ' + (cliente ? 'ativo' : '')}><span>2</span> Bipar produto</div>
        <div className="passo"><span>✓</span> Registrado</div>
      </div>

      {cliente ? (
        <div className="cliente-card">
          <div>
            <div className="cliente-nome">{cliente.nome}</div>
            <div className="muted">{cliente.codigo}</div>
          </div>
          <div className="rua-grande"><small>RUA</small>{cliente.rua}</div>
          <button className="btn btn-leve" onClick={() => { setCliente(null); setRes(null); }}>Trocar cliente</button>
        </div>
      ) : null}

      <Scanner titulo={cliente ? 'BIPAR PRODUTO' : 'BIPAR CLIENTE'} placeholder={cliente ? 'Código do produto…' : 'Etiqueta do cliente…'} onLeitura={onLeitura} />

      {cliente && (
        <div className="qtd-linha">
          <span>Quantidade por leitura</span>
          <div className="stepper">
            <button className="btn btn-leve" onClick={() => setQtd((q) => Math.max(1, q - 1))} aria-label="Menos">−</button>
            <b>{qtd}</b>
            <button className="btn btn-leve" onClick={() => setQtd((q) => Math.min(500, q + 1))} aria-label="Mais">+</button>
          </div>
        </div>
      )}

      <Resultado r={res} />

      <label className="check-linha">
        <input type="checkbox" checked={exigir} onChange={(e) => { setExigir(e.target.checked); try { localStorage.setItem('vjoy_exigir_cliente', e.target.checked ? '1' : '0'); } catch {} }} />
        Exigir bipar o cliente antes de cada produto (modo mais seguro)
      </label>

      <h3 className="sec">Minhas últimas entradas</h3>
      <div className="lista-cartoes">
        {recentes.length === 0 && <div className="vazio">Nenhuma entrada registrada ainda.</div>}
        {recentes.map((r) => (
          <div key={r.id + r.codigo} className={'mini-cartao' + (r.excedente ? ' alerta' : '')}>
            <div><b>{r.codigo}</b> <span className="muted">×{r.qtd}</span> {r.excedente && <span className="badge badge-amarelo">sobra</span>}</div>
            <div className="muted pequeno">{r.cliente} · <b>{r.rua}</b> · {r.pedido ? 'Pedido ' + r.pedido : 'sem pedido'} · {fmtDataHora(r.criado_em)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
