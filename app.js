const CHAVE_DADOS = 'campobase-data-v1';
const CHAVE_SENHA = 'campobase-professor-password-v1';
const CHAVE_SESSAO = 'campobase-professor-session-v1';
const RODADAS_SENHA = 120000;

const dadosIniciais = {
  jogos: [{
    id: 'g1',
    titulo: 'Jogo de sábado',
    data: '2026-11-21',
    horario: '08:00',
    local: 'Campo da escolinha',
    respostas: [
      { nome: 'Aluno 1', status: 'sim' },
      { nome: 'Aluno 2', status: 'sim' },
      { nome: 'Aluno 3', status: 'nao' },
      { nome: 'Aluno 4', status: 'pendente' }
    ]
  }]
};

function dataLocal() {
  const hoje = new Date();
  return new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function normalizarStatus(status) {
  if (status === 'yes' || status === 'confirmed' || status === 'sim') return 'sim';
  if (status === 'no' || status === 'declined' || status === 'nao') return 'nao';
  if (status === 'pending' || status === 'pendente') return 'pendente';
  return null;
}

function carregarDados() {
  try {
    const dadosSalvos = localStorage.getItem(CHAVE_DADOS);
    if (!dadosSalvos) return JSON.parse(JSON.stringify(dadosIniciais));

    const dadosLidos = JSON.parse(dadosSalvos);
    const jogosSalvos = dadosLidos.jogos || dadosLidos.games;
    if (!Array.isArray(jogosSalvos)) throw new Error('A lista de jogos salva está inválida.');
    const alunosSalvos = dadosLidos.alunos || dadosLidos.athletes || [];

    return {
      jogos: jogosSalvos.map((jogo) => {
        const respostasSalvas = Array.isArray(jogo.respostas)
          ? jogo.respostas
          : Array.isArray(jogo.responses)
            ? jogo.responses
            : Object.entries(jogo.respostas || jogo.responses || {}).map(([idAluno, status]) => ({
              nome: alunosSalvos.find((aluno) => aluno.id === idAluno)?.nome
                || alunosSalvos.find((aluno) => aluno.id === idAluno)?.name,
              status
            }));

        return {
          id: String(jogo.id),
          titulo: String(jogo.titulo || jogo.title || 'Jogo da escolinha'),
          data: String(jogo.data || jogo.date || ''),
          horario: String(jogo.horario || jogo.time || ''),
          local: String(jogo.local || jogo.location || ''),
          respostas: respostasSalvas.flatMap((resposta) => {
            const nome = resposta.nome || resposta.name;
            const status = normalizarStatus(resposta.status || resposta.answer);
            return nome && status ? [{ nome: String(nome), status }] : [];
          })
        };
      })
    };
  } catch (erro) {
    console.error('Não foi possível carregar os jogos salvos.', erro);
    return JSON.parse(JSON.stringify(dadosIniciais));
  }
}

let dados = carregarDados();
let temporizadorAviso;
const avisoFlutuante = document.querySelector('#aviso-flutuante');

function salvarDados() {
  try {
    localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
  } catch (erro) {
    console.error('Não foi possível salvar os jogos.', erro);
    mostrarAviso('Não foi possível salvar os dados neste navegador.');
    throw erro;
  }
}

function escaparHTML(valor) {
  return String(valor).replace(/[&<>"']/g, (caractere) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[caractere]);
}

function formatarData(valor) {
  if (!valor) return 'Data não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(new Date(`${valor}T12:00:00`));
}

function normalizarNome(valor) {
  return valor.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function rotuloResposta(status) {
  if (status === 'sim') return 'Vai';
  if (status === 'nao') return 'Não vai';
  return 'Pendente';
}

function mostrarAviso(mensagem) {
  avisoFlutuante.textContent = mensagem;
  avisoFlutuante.classList.add('visivel');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => avisoFlutuante.classList.remove('visivel'), 2600);
}

function codificarBase64(sequencia) {
  return btoa(String.fromCharCode(...new Uint8Array(sequencia)));
}

function decodificarBase64(valor) {
  return Uint8Array.from(atob(valor), (caractere) => caractere.charCodeAt(0));
}

async function gerarResumoSenha(senha, sal) {
  if (!window.crypto?.subtle) throw new Error('Use o app em localhost ou HTTPS para configurar a senha.');
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const resumo = await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: sal, iterations: RODADAS_SENHA, hash: 'SHA-256'
  }, chave, 256);
  return codificarBase64(resumo);
}

async function criarRegistroSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return {
    sal: codificarBase64(sal),
    resumo: await gerarResumoSenha(senha, sal)
  };
}

async function conferirSenha(senha, registro) {
  const resumo = await gerarResumoSenha(senha, decodificarBase64(registro.sal || registro.salt));
  return resumo === (registro.resumo || registro.hash);
}

function iniciarPaginaAluno() {
  mostrarJogosAluno();
}

function mostrarJogosAluno() {
  const raiz = document.querySelector('#jogos-aluno');
  if (!dados.jogos.length) {
    raiz.innerHTML = '<section class="cartao-vazio"><span class="bola-vazia">⚽</span><h2>Nenhum jogo cadastrado</h2><p>Volte mais tarde ou fale com o treinador.</p></section>';
    return;
  }

  const jogosOrdenados = [...dados.jogos].sort((a, b) => a.data.localeCompare(b.data));
  raiz.innerHTML = jogosOrdenados.map((jogo) => {
    const listaRespostas = jogo.respostas.map((resposta) => `<li class="linha-resposta">
      <span class="avatar-aluno">${escaparHTML(resposta.nome.charAt(0).toUpperCase())}</span>
      <span class="nome-aluno">${escaparHTML(resposta.nome)}</span>
      <span class="status-resposta status-${resposta.status}">${rotuloResposta(resposta.status)}</span>
    </li>`).join('');
    return `<article class="cartao-jogo-aluno">
      <div class="linha-superior-jogo"><span class="rotulo">JOGO DA ESCOLINHA</span><span class="data-jogo">${formatarData(jogo.data)}</span></div>
      <h2>${escaparHTML(jogo.titulo)}</h2>
      <p class="detalhes-jogo">${escaparHTML(jogo.horario)} · ${escaparHTML(jogo.local)}</p>
      <form class="formulario-resposta-aluno" data-jogo-id="${escaparHTML(jogo.id)}">
        <label>Seu nome<input name="nome" maxlength="70" autocomplete="name" placeholder="Digite seu nome" required></label>
        <div class="botoes-resposta">
          <button class="botao botao-sim" type="submit" value="sim">Vou participar</button>
          <button class="botao botao-nao" type="submit" value="nao">Não vou</button>
        </div>
        <p class="retorno-resposta" aria-live="polite"></p>
      </form>
      <ul class="lista-respostas">${listaRespostas || '<li class="sem-respostas">Seja o primeiro a responder.</li>'}</ul>
    </article>`;
  }).join('');

  raiz.querySelectorAll('.formulario-resposta-aluno').forEach((formulario) => {
    formulario.addEventListener('submit', enviarRespostaAluno);
  });
}

function enviarRespostaAluno(evento) {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const nome = new FormData(formulario).get('nome').trim();
  const status = evento.submitter?.value;
  const jogo = dados.jogos.find((item) => item.id === formulario.dataset.jogoId);
  if (!jogo || !nome || !['sim', 'nao'].includes(status)) return;

  const respostaAnterior = jogo.respostas.find((resposta) => normalizarNome(resposta.nome) === normalizarNome(nome));
  if (respostaAnterior) respostaAnterior.status = status;
  else jogo.respostas.push({ nome, status });
  salvarDados();
  mostrarJogosAluno();
  const formularioAtualizado = document.querySelector(`.formulario-resposta-aluno[data-jogo-id="${CSS.escape(jogo.id)}"]`);
  formularioAtualizado.querySelector('[name="nome"]').value = nome;
  formularioAtualizado.querySelector('.retorno-resposta').textContent = status === 'sim'
    ? 'Resposta salva: você vai participar!'
    : 'Resposta salva: você não vai participar.';
}

function iniciarPaginaProfessor() {
  mostrarAcessoProfessor();
  document.querySelector('#formulario-configuracao').addEventListener('submit', configurarSenhaProfessor);
  document.querySelector('#formulario-entrada').addEventListener('submit', validarAcessoProfessor);
  document.querySelector('#formulario-jogo').addEventListener('submit', criarJogo);
  document.querySelector('#botao-sair').addEventListener('click', sairDaAreaProfessor);
  document.querySelector('#copiar-link-aluno').addEventListener('click', copiarLinkAluno);
  document.querySelector('#formulario-jogo [name="data"]').min = dataLocal();
}

function mostrarAcessoProfessor() {
  const telaConfiguracao = document.querySelector('#tela-configuracao');
  const telaEntrada = document.querySelector('#tela-entrada');
  const painel = document.querySelector('#painel-professor');
  const senhaConfigurada = Boolean(localStorage.getItem(CHAVE_SENHA));
  const acessoLiberado = sessionStorage.getItem(CHAVE_SESSAO) === 'true';
  telaConfiguracao.hidden = senhaConfigurada;
  telaEntrada.hidden = !senhaConfigurada || acessoLiberado;
  painel.hidden = !acessoLiberado;
  if (acessoLiberado) mostrarJogosProfessor();
}

async function configurarSenhaProfessor(evento) {
  evento.preventDefault();
  const senha = document.querySelector('#senha-configurar').value;
  const confirmacao = document.querySelector('#confirmar-senha').value;
  const campoErro = document.querySelector('#erro-configuracao');
  campoErro.textContent = '';
  if (senha.length < 8) {
    campoErro.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
    return;
  }
  if (senha !== confirmacao) {
    campoErro.textContent = 'As senhas não são iguais.';
    return;
  }
  try {
    localStorage.setItem(CHAVE_SENHA, JSON.stringify(await criarRegistroSenha(senha)));
    sessionStorage.setItem(CHAVE_SESSAO, 'true');
    mostrarAcessoProfessor();
  } catch (erro) {
    console.error('Não foi possível configurar a senha.', erro);
    campoErro.textContent = erro.message || 'Não foi possível configurar a senha neste navegador.';
  }
}

async function validarAcessoProfessor(evento) {
  evento.preventDefault();
  const senha = document.querySelector('#senha-entrada').value;
  const campoErro = document.querySelector('#erro-entrada');
  campoErro.textContent = '';
  try {
    const registro = JSON.parse(localStorage.getItem(CHAVE_SENHA));
    if (!await conferirSenha(senha, registro)) {
      campoErro.textContent = 'Senha incorreta. Tente novamente.';
      return;
    }
    sessionStorage.setItem(CHAVE_SESSAO, 'true');
    mostrarAcessoProfessor();
  } catch (erro) {
    console.error('Não foi possível verificar a senha.', erro);
    campoErro.textContent = erro.message || 'Não foi possível verificar a senha neste navegador.';
  }
}

function sairDaAreaProfessor() {
  sessionStorage.removeItem(CHAVE_SESSAO);
  mostrarAcessoProfessor();
  mostrarAviso('Você saiu da área do professor.');
}

function mostrarJogosProfessor() {
  const raiz = document.querySelector('#jogos-professor');
  if (!dados.jogos.length) {
    raiz.innerHTML = '<section class="cartao-vazio"><span class="bola-vazia">⚽</span><h2>Nenhum jogo cadastrado</h2><p>Use o formulário acima para criar um jogo.</p></section>';
    return;
  }

  const jogosOrdenados = [...dados.jogos].sort((a, b) => a.data.localeCompare(b.data));
  raiz.innerHTML = jogosOrdenados.map((jogo) => {
    const listaRespostas = jogo.respostas.length
      ? jogo.respostas.map((resposta) => `<li class="linha-resposta">
          <span class="avatar-aluno">${escaparHTML(resposta.nome.charAt(0).toUpperCase())}</span>
          <span class="nome-aluno">${escaparHTML(resposta.nome)}</span>
          <select class="seletor-status" data-jogo-id="${escaparHTML(jogo.id)}" data-aluno="${escaparHTML(resposta.nome)}" aria-label="Status de ${escaparHTML(resposta.nome)}">
            <option value="sim" ${resposta.status === 'sim' ? 'selected' : ''}>Vai</option>
            <option value="nao" ${resposta.status === 'nao' ? 'selected' : ''}>Não vai</option>
            <option value="pendente" ${resposta.status === 'pendente' ? 'selected' : ''}>Pendente</option>
          </select>
        </li>`).join('')
      : '<li class="sem-respostas">Ainda não há respostas para este jogo.</li>';
    const quantidadeSim = jogo.respostas.filter((resposta) => resposta.status === 'sim').length;
    const quantidadeNao = jogo.respostas.filter((resposta) => resposta.status === 'nao').length;
    return `<article class="cartao-jogo-professor">
      <div class="cabecalho-jogo-professor">
        <div><p class="rotulo">${formatarData(jogo.data)}</p><h3>${escaparHTML(jogo.titulo)}</h3><p class="detalhes-jogo">${escaparHTML(jogo.horario)} · ${escaparHTML(jogo.local)}</p></div>
        <button class="botao-excluir" type="button" data-excluir-jogo="${escaparHTML(jogo.id)}">Excluir jogo</button>
      </div>
      <div class="contagem-jogo"><span><strong>${quantidadeSim}</strong> vão</span><span><strong>${quantidadeNao}</strong> não vão</span></div>
      <ul class="lista-respostas">${listaRespostas}</ul>
    </article>`;
  }).join('');

  raiz.querySelectorAll('.seletor-status').forEach((seletor) => {
    seletor.addEventListener('change', alterarStatusAluno);
  });
  raiz.querySelectorAll('[data-excluir-jogo]').forEach((botao) => {
    botao.addEventListener('click', apagarJogo);
  });
}

function criarJogo(evento) {
  evento.preventDefault();
  const formulario = new FormData(evento.currentTarget);
  dados.jogos.push({
    id: `g${Date.now()}`,
    titulo: formulario.get('titulo').trim(),
    data: formulario.get('data'),
    horario: formulario.get('horario'),
    local: formulario.get('local').trim(),
    respostas: []
  });
  salvarDados();
  evento.currentTarget.reset();
  document.querySelector('#formulario-jogo [name="data"]').min = dataLocal();
  document.querySelector('#formulario-jogo [name="horario"]').value = '08:00';
  mostrarJogosProfessor();
  mostrarAviso('Jogo criado.');
}

function alterarStatusAluno(evento) {
  const { jogoId, aluno } = evento.currentTarget.dataset;
  const jogo = dados.jogos.find((item) => item.id === jogoId);
  const resposta = jogo?.respostas.find((item) => normalizarNome(item.nome) === normalizarNome(aluno));
  if (!resposta) {
    mostrarAviso('Não foi possível localizar a resposta do aluno.');
    return;
  }
  resposta.status = evento.currentTarget.value;
  salvarDados();
  mostrarJogosProfessor();
  mostrarAviso('Status do aluno atualizado.');
}

function apagarJogo(evento) {
  const jogo = dados.jogos.find((item) => item.id === evento.currentTarget.dataset.excluirJogo);
  if (!jogo || !window.confirm(`Excluir "${jogo.titulo}" e todas as respostas?`)) return;
  dados.jogos = dados.jogos.filter((item) => item.id !== jogo.id);
  salvarDados();
  mostrarJogosProfessor();
  mostrarAviso('Jogo excluído.');
}

async function copiarLinkAluno() {
  const endereco = new URL('index.html', window.location.href).toString();
  try {
    await navigator.clipboard.writeText(endereco);
    mostrarAviso('Link da página do aluno copiado.');
  } catch (erro) {
    console.error('Não foi possível copiar o link.', erro);
    window.prompt('Copie o link da página do aluno:', endereco);
  }
}

if (document.body.dataset.pagina === 'aluno') iniciarPaginaAluno();
if (document.body.dataset.pagina === 'professor') iniciarPaginaProfessor();
