document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('analise-container');
    const sugestaoContainer = document.getElementById('sugestao-container');
    const valorInput = document.getElementById('valor');
    const taxaInput = document.getElementById('taxa');
    const prazoInput = document.getElementById('prazo');
    const simularBtn = document.getElementById('btn-simular');
    const resultadoSimulacao = document.getElementById('resultado-simulacao');
    const refreshButton = document.querySelector('.btn-refresh');
    const refreshSimulacaoButton = document.querySelector('.btn-refresh-simulacao');
    const mainContainer = document.querySelector('.container');
    const empresaId = Number(mainContainer.dataset.empresaId);
    const justificativaToggle = document.getElementById('justificativa-toggle');
    const justificativaContent = document.getElementById('justificativa-content');
    const btnAprovarFinal = document.getElementById('btn-aprovar-final');
    const btnRejeitarFinal = document.getElementById('btn-rejeitar-final');
    const decisaoErro = document.getElementById('decisao-erro');
    const statusEmpresaEl = document.getElementById('status-empresa');
    const modal = document.getElementById('modal-confirmacao');
    const modalValores = document.getElementById('modal-valores');
    const modalBtnSim = document.getElementById('modal-btn-sim');
    const modalBtnNao = document.getElementById('modal-btn-nao');


    const habilitarBotaoAprovar = (habilitar) => {
        if (habilitar) {
            btnAprovarFinal.classList.remove('disabled');
            decisaoErro.style.display = 'none';
        } else {
            btnAprovarFinal.classList.add('disabled');
        }
    };

    const enviarDecisao = async (decisao) => {
        try {
            const response = await fetch(`/api/decisao/${empresaId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decisao: decisao,
                    valor: valorInput.value,
                    taxa: taxaInput.value,
                    prazo: prazoInput.value,
                }),
            });
            if (!response.ok) throw new Error('Falha ao salvar decisão.');

            const resultado = await response.json();
            console.log(resultado.mensagem);

            statusEmpresaEl.textContent = decisao;
            statusEmpresaEl.className = `status-${decisao.toLowerCase().replace(' ', '-')}`;
            alert(`Status da empresa atualizado para: ${decisao}`);
            modal.style.display = 'none';

        } catch (error) {
            console.error('Erro ao enviar decisão:', error);
            alert('Não foi possível salvar a decisão.');
        }
    };


    const buscarSugestao = async () => {
        sugestaoContainer.innerHTML = '<p style="color: #666;">Buscando sugestão de crédito...</p>';
        justificativaToggle.style.display = 'none';
        justificativaContent.style.display = 'none';
        try {
            const response = await fetch(`/api/sugestao/${empresaId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || 'Falha ao buscar sugestão.');
            }
            const sugestao = await response.json();

            valorInput.value = sugestao.valor_sugerido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            taxaInput.value = `${String(sugestao.taxa_juros).replace('.', ',')}% a.m.`;
            prazoInput.value = sugestao.prazo_pagamento;
            sugestaoContainer.innerHTML = '<p style="color: #4CAF50;">Sugestão gerada abaixo.</p>';

            if (sugestao.justificativa && sugestao.justificativa.trim() !== '') {
                justificativaContent.textContent = sugestao.justificativa;
                justificativaToggle.textContent = 'Ver a explicação';
                justificativaToggle.style.display = 'block';
            }
        } catch (error) {
            console.error('Erro ao buscar sugestão:', error);
            sugestaoContainer.innerHTML = `<p style="color: #e74c3c;">Não foi possível gerar a sugestão.</p>`;
        }
    };

    const buscarAnalise = async () => {
        try {
            const response = await fetch(`/api/analise/${empresaId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || `Falha ao buscar análise. Status: ${response.status}`);
            }
            const data = await response.json();
            if (data.analise) {
                container.innerHTML = data.analise;
                buscarSugestao();
            } else {
                container.innerHTML = '<p style="color: #e74c3c;">Ocorreu um erro ao gerar a análise.</p>';
            }
        } catch (error) {
            console.error('Erro no script de análise:', error);
            container.innerHTML = `<p style="color: #e74c3c;"><strong>Erro:</strong> Não foi possível carregar a análise. ${error.message}</p>`;
        }
    };

    const solicitarNovaAnalise = async () => {
        if (!refreshButton) return;
        refreshButton.classList.add('loading');
        container.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div><p style="margin-top: 10px;">Gerando nova análise...</p>`;
        try {
            const response = await fetch(`/api/analise/${empresaId}`, { method: 'PUT' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || `Falha ao gerar nova análise.`);
            }
            const data = await response.json();
            if (data.analise) {
                container.innerHTML = data.analise;
                buscarSugestao();
            } else {
                container.innerHTML = '<p style="color: #e74c3c;">Ocorreu um erro ao gerar a nova análise.</p>';
            }
        } catch (error) {
            console.error('Erro ao solicitar nova análise:', error);
            container.innerHTML = `<p style="color: #e74c3c;"><strong>Erro:</strong> ${error.message}</p>`;
        } finally {
            refreshButton.classList.remove('loading');
        }
    };

    const solicitarNovaSugestao = async () => {
        sugestaoContainer.innerHTML = '<p style="color: #666;">Gerando nova sugestão...</p>';
        justificativaToggle.style.display = 'none';
        justificativaContent.style.display = 'none';
        if (refreshSimulacaoButton) refreshSimulacaoButton.classList.add('loading');
        try {
            const response = await fetch(`/api/sugestao/${empresaId}`, { method: 'PUT' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.erro || 'Falha ao gerar nova sugestão.');
            }
            const sugestao = await response.json();
            valorInput.value = sugestao.valor_sugerido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            taxaInput.value = `${String(sugestao.taxa_juros).replace('.', ',')}% a.m.`;
            prazoInput.value = sugestao.prazo_pagamento;
            sugestaoContainer.innerHTML = '<p style="color: #4CAF50;">Nova sugestão gerada pela IA!</p>';
            if (sugestao.justificativa && sugestao.justificativa.trim() !== '') {
                justificativaContent.textContent = sugestao.justificativa;
                justificativaToggle.textContent = 'Ver a explicação';
                justificativaToggle.style.display = 'block';
            }
        } catch (error) {
            console.error('Erro ao gerar nova sugestão:', error);
            sugestaoContainer.innerHTML = `<p style="color: #e74c3c;">Não foi possível gerar nova sugestão.</p>`;
        } finally {
            if (refreshSimulacaoButton) refreshSimulacaoButton.classList.remove('loading');
        }
    };


    simularBtn.addEventListener('click', () => {
        const valorStr = valorInput.value.replace(/[^\d,]/g, '').replace('.', '').replace(',', '.');
        const taxaStr = taxaInput.value.replace(/[^\d.,]/g, '').replace(',', '.');
        const prazo = parseInt(prazoInput.value);
        const valor = parseFloat(valorStr);
        const taxa = parseFloat(taxaStr) / 100;

        if (isNaN(valor) || isNaN(taxa) || isNaN(prazo) || valor <= 0 || taxa <= 0 || prazo <= 0) {
            resultadoSimulacao.innerHTML = '<span style="color:#d32f2f;">Preencha todos os campos corretamente.</span>';
            return;
        }
        const parcela = valor * (taxa * Math.pow(1 + taxa, prazo)) / (Math.pow(1 + taxa, prazo) - 1);
        const totalPago = parcela * prazo;
        resultadoSimulacao.innerHTML = `Parcela mensal: <strong>${parcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong><br>Total pago: <strong>${totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>`;

        habilitarBotaoAprovar(true);
    });

    justificativaToggle.addEventListener('click', () => {
        const isHidden = justificativaContent.style.display === 'none';
        if (isHidden) {
            justificativaContent.style.display = 'block';
            justificativaToggle.textContent = 'Ocultar explicação';
        } else {
            justificativaContent.style.display = 'none';
            justificativaToggle.textContent = 'Ver a explicação';
        }
    });

    if (refreshButton) {
        refreshButton.addEventListener('click', solicitarNovaAnalise);
    }
    if (refreshSimulacaoButton) {
        refreshSimulacaoButton.addEventListener('click', solicitarNovaSugestao);
    }

    btnAprovarFinal.addEventListener('click', () => {
        if (btnAprovarFinal.classList.contains('disabled')) {
            decisaoErro.style.display = 'block';
            return;
        }
        modalValores.innerHTML = `
            <p><strong>Valor do Crédito:</strong> ${valorInput.value}</p>
            <p><strong>Taxa de Juros:</strong> ${taxaInput.value}</p>
            <p><strong>Prazo de Pagamento:</strong> ${prazoInput.value} meses</p>
        `;
        modal.style.display = 'flex';
    });

    btnRejeitarFinal.addEventListener('click', () => {
        if (confirm('Deseja realmente REJEITAR o crédito para esta empresa?')) {
            enviarDecisao('Recusado');
        }
    });

    modalBtnSim.addEventListener('click', () => enviarDecisao('Aprovado'));
    modalBtnNao.addEventListener('click', () => modal.style.display = 'none');

    habilitarBotaoAprovar(false);
    buscarAnalise();
});