// Leitura de código de barras: leitor físico (USB/Bluetooth = teclado + Enter) e câmera do aparelho.
// A câmera fica aberta em modo contínuo: lê → valida → mostra resultado → volta a ler sozinha.
import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

const FORMATOS_NATIVOS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];
const ehToque = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function Scanner({ titulo = 'BIPAR CÓDIGO', onLeitura, desabilitado, manterFoco = true, placeholder = 'Aguardando leitura…', grande = true }) {
  const [valor, setValor] = useState('');
  const [camera, setCamera] = useState(false);
  const [digitar, setDigitar] = useState(!ehToque());
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);

  const processar = useCallback(async (codigo) => {
    const c = String(codigo || '').trim();
    if (!c || ocupado) return null;
    setOcupado(true);
    try { return await onLeitura(c); } finally { setOcupado(false); }
  }, [onLeitura, ocupado]);

  // mantém o foco no campo para o leitor físico funcionar sem tocar na tela
  useEffect(() => {
    if (!manterFoco || camera || desabilitado) return;
    const focar = () => {
      const a = document.activeElement;
      const outroCampo = a && a !== inputRef.current && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName);
      if (!outroCampo && !document.querySelector('.modal-fundo')) inputRef.current?.focus({ preventScroll: true });
    };
    focar();
    const t = setInterval(focar, 800);
    return () => clearInterval(t);
  }, [manterFoco, camera, desabilitado]);

  const enviar = async (e) => {
    e?.preventDefault();
    const v = valor;
    setValor('');
    await processar(v);
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={'scanner' + (grande ? ' scanner-grande' : '')}>
      <div className="scanner-titulo">{titulo}</div>
      <form onSubmit={enviar} className="scanner-linha">
        <input
          ref={inputRef}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={placeholder}
          inputMode={digitar ? 'text' : 'none'}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          disabled={desabilitado}
          className="scanner-input"
          aria-label={titulo}
        />
        {valor && <button className="btn btn-primario" type="submit" disabled={desabilitado || ocupado}>OK</button>}
      </form>
      <div className="scanner-botoes">
        <button type="button" className="btn btn-camera" onClick={() => setCamera(true)} disabled={desabilitado}>
          <span aria-hidden>📷</span> BIPAR CÓDIGO
        </button>
        <button type="button" className="btn btn-leve" onClick={() => { setDigitar((d) => !d); setTimeout(() => inputRef.current?.focus(), 50); }} title="Digitar o código manualmente">
          ⌨️ {digitar ? 'Teclado ligado' : 'Digitar'}
        </button>
      </div>
      {camera && <CameraLeitor titulo={titulo} onFechar={() => setCamera(false)} onCodigo={processar} />}
    </div>
  );
}

function CameraLeitor({ titulo, onFechar, onCodigo }) {
  const videoRef = useRef(null);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [lanterna, setLanterna] = useState(null); // null = não suportado
  const estado = useRef({ ultimo: null, vistoEm: 0, pausado: false, stream: null, parar: null });
  const onCodigoRef = useRef(onCodigo); onCodigoRef.current = onCodigo;

  const aoDetectar = useCallback(async (codigo) => {
    const s = estado.current;
    const agora = Date.now();
    // a mesma etiqueta só é lida de novo depois de sair do quadro (evita contar 2x a mesma unidade)
    if (codigo === s.ultimo && agora - s.vistoEm < 900) { s.vistoEm = agora; return; }
    if (s.pausado) return;
    s.pausado = true; s.ultimo = codigo; s.vistoEm = agora;
    let r;
    try { r = await onCodigoRef.current(codigo); } catch (e) { r = { nivel: 'ERRO', titulo: e.message }; }
    setResultado(r ? { ...r, codigo } : { nivel: 'SUCESSO', titulo: codigo, codigo });
    setTimeout(() => { s.pausado = false; s.vistoEm = Date.now(); }, 700);
    setTimeout(() => setResultado((x) => (x?.codigo === codigo ? null : x)), 2500);
  }, []);

  useEffect(() => {
    let vivo = true;
    const s = estado.current;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro('Este navegador não permite acesso à câmera. Use HTTPS e Chrome/Safari atualizados.');
        return;
      }
      const constraints = { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };
      try {
        const nativo = 'BarcodeDetector' in window ? await window.BarcodeDetector.getSupportedFormats().catch(() => []) : [];
        if (nativo.length) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return; }
          s.stream = stream;
          const v = videoRef.current; v.srcObject = stream; await v.play();
          const det = new window.BarcodeDetector({ formats: FORMATOS_NATIVOS.filter((f) => nativo.includes(f)) });
          const track = stream.getVideoTracks()[0];
          if (track.getCapabilities?.().torch) setLanterna(false);
          const loop = async () => {
            if (!vivo) return;
            try {
              if (v.readyState >= 2) {
                const cods = await det.detect(v);
                if (cods.length) aoDetectar(cods[0].rawValue);
              }
            } catch {}
            setTimeout(loop, 90);
          };
          loop();
        } else {
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80, delayBetweenScanSuccess: 80 });
          const controls = await reader.decodeFromConstraints(constraints, videoRef.current, (res) => { if (res) aoDetectar(res.getText()); });
          if (!vivo) { controls.stop(); return; }
          s.parar = () => controls.stop();
          if (controls.switchTorch) { s.torch = controls.switchTorch; setLanterna(false); }
        }
      } catch (e) {
        setErro(e?.name === 'NotAllowedError' ? 'Permissão da câmera negada. Libere a câmera nas configurações do navegador.' : 'Não foi possível abrir a câmera: ' + (e?.message || e));
      }
    })();
    return () => {
      vivo = false;
      s.stream?.getTracks().forEach((t) => t.stop());
      s.parar?.();
    };
  }, [aoDetectar]);

  const alternarLanterna = async () => {
    const s = estado.current, novo = !lanterna;
    try {
      if (s.stream) await s.stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: novo }] });
      else if (s.torch) await s.torch(novo);
      setLanterna(novo);
    } catch {}
  };

  const cor = resultado ? { SUCESSO: 'ok', ERRO: 'erro', ALERTA: 'alerta' }[resultado.nivel] || 'ok' : '';
  return (
    <div className="camera-tela" role="dialog" aria-label="Leitor de código de barras">
      <video ref={videoRef} playsInline muted className="camera-video" />
      <div className={'camera-mira ' + cor} />
      <div className="camera-topo">
        <span className="camera-titulo">{titulo}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {lanterna !== null && <button className="btn btn-escuro" onClick={alternarLanterna}>{lanterna ? '🔦 Desligar' : '🔦 Lanterna'}</button>}
          <button className="btn btn-escuro" onClick={onFechar}>✕ Fechar</button>
        </div>
      </div>
      {erro && <div className="camera-erro">{erro}</div>}
      {resultado ? (
        <div className={'camera-resultado ' + cor}>
          <div className="camera-resultado-titulo">{resultado.nivel === 'SUCESSO' ? '✓ ' : resultado.nivel === 'ALERTA' ? '⚠️ ' : '❌ '}{resultado.titulo}</div>
          {resultado.sub && <div className="camera-resultado-sub">{resultado.sub}</div>}
        </div>
      ) : (
        !erro && <div className="camera-dica">Aponte para o código de barras. Para ler a mesma etiqueta outra vez, afaste a câmera e aponte de novo.</div>
      )}
    </div>
  );
}
