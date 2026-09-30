import { useState } from 'react';
import { get, post, put } from '../api.js';
import { Carregando, ErroBox, Modal, useCarregar, useToast } from '../components/ui.jsx';

export default function Produtos() {
  const toast = useToast();
  const [busca, setBusca] = useState('');
  const { dados, carregando, erro, recarregar } = useCarregar(() => get('/produtos?busca=' + encodeURIComponent(busca)), [busca]);
  const [edit, setEdit] = useState(null);
  const salvar = async (f) => {
    try {
      if (f.id) await put('/produtos/' + f.id, { codigo_barras: f.codigo_barras, descricao: f.descricao, ativo: f.ativo });
      else await post('/produtos', f);
      toast('Produto salvo'); setEdit(null); recarregar(true);
    } catch (e) { toast(e.message, 'ERRO'); }
  };
  return (
    <div className="pagina">
      <div className="pagina-cabeca"><h1>Produtos</h1><button className="btn btn-primario" onClick={() => setEdit({ codigo: '', descricao: '', unidade: 'PC', ativo: true })}>+ Novo produto</button></div>
      <p className="muted">Produtos são criados automaticamente na importação (linhas PA). O código de barras da embalagem é, por padrão, o campo <b>Código</b>.</p>
      <input className="busca" placeholder="Buscar código, descrição ou código laboratório (mostra até 300)" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <ErroBox erro={erro} />
      {carregando && !dados ? <Carregando /> : (
        <div className="tabela-rolagem"><table className="tabela"><thead><tr><th>Código</th><th>Código de barras</th><th>Descrição</th><th>Cód. laboratório</th><th>Unid.</th><th className="num">Na empresa</th><th></th></tr></thead>
          <tbody>{dados?.map((p) => <tr key={p.id} className={!p.ativo ? 'muted' : ''}><td><b>{p.codigo}</b></td><td>{p.codigo_barras}</td><td>{p.descricao}</td><td className="pequeno">{p.codigo_laboratorio}</td><td>{p.unidade}</td><td className="num">{p.unidades}</td><td><button className="btn btn-leve btn-p" onClick={() => setEdit(p)}>Editar</button></td></tr>)}</tbody></table></div>
      )}
      {edit && <ProdutoModal p={edit} onSalvar={salvar} onFechar={() => setEdit(null)} />}
    </div>
  );
}
function ProdutoModal({ p, onSalvar, onFechar }) {
  const [f, setF] = useState(p);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Modal titulo={p.id ? 'Editar ' + p.codigo : 'Novo produto'} onFechar={onFechar}
      rodape={<><button className="btn btn-leve" onClick={onFechar}>Cancelar</button><button className="btn btn-primario" onClick={() => onSalvar(f)}>Salvar</button></>}>
      <div className="form">
        {!p.id && <label>Código<input value={f.codigo} onChange={set('codigo')} /></label>}
        <label>Código de barras (vazio = igual ao código)<input value={f.codigo_barras || ''} onChange={set('codigo_barras')} /></label>
        <label>Descrição<input value={f.descricao} onChange={set('descricao')} /></label>
        {!p.id && <label>Unidade<input value={f.unidade} onChange={set('unidade')} /></label>}
        {p.id && <label className="check-linha"><input type="checkbox" checked={f.ativo} onChange={set('ativo')} /> Ativo</label>}
      </div>
    </Modal>
  );
}
