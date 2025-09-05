from flask import Flask, request, jsonify
import google.generativeai as genai
import os
from dotenv import load_dotenv
import json

app = Flask(__name__)

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

SYSTEM_INSTRUCTION_ANALISTA = """
Você é uma Assistente de Análise de Crédito Inteligente, com o objetivo de otimizar o processo de concessão de empréstimos a pequenas e médias empresas.
Sintetize informações, identifique riscos e oportunidades não óbvios nos dados.
Forneça um relatório curto com respostas claras, concisas e baseadas em dados.
Verifique como está o setor da empresa em questão se há oportunidades no momento ou riscos emergentes.

Informações relevantes:
Empresa: Nome da empresa. 
Receita Anual: Receita total anual da empresa(número inteiro).
Dívida Total: Total de dívida que a empresa possui(número inteiro).
Prazo de Pagamento(dias): Dias que a empresa leva para pagar suas dívidas(número inteiro).
Setor: Categoria em que a empresa opera(string).
Rating: Avaliação de crédito da empresa(string).
Notícias Recentes: Resumo de notícias relevantes sobre a empresa(s)

Gere justificativas e recomendações preliminares para a concessão ou recusa de crédito.
Forneça a recomendação preliminar e explique brevemente o motivo.
Ajuste os valores monetários com R$ e . para milhar e , para decimal.

Siga o seguinte padrão:
<p><strong>Recomendação Preliminar:</strong></p> - INSIRA A RECOMENDAÇÃO AQUI -
<p><strong>Justificativa:</strong></p> - INSIRA A JUSTIFICATIVA AQUI -
"""

SYSTEM_INSTRUCTION_ESPECIALISTA = """
Você é um Assistente de Análise de Crédito Inteligente para concessão de empréstimos a pequenas e médias empresas (PMEs). Sua função é receber dados, e com base neles, definir uma proposta de crédito inicial. A justificativa deve ser coerente com a análise prévia de se o crédito deve ser aprovado, reprovado, aprovado com ressalvas e etc.

Sua resposta DEVE SER APENAS um objeto JSON, sem nenhum texto ou formatação adicional.
O JSON deve ter EXATAMENTE as seguintes chaves:
- "valor_sugerido": um número (integer) representando o valor recomendado do empréstimo.
- "taxa_juros": um número (float) representando a taxa de juros mensal recomendada (ex: 1.5 para 1.5%).
- "prazo_pagamento": um número (integer) representando o prazo recomendado em meses.
- "justificativa": uma string curta e clara (máximo 2 frases) explicando o porquê dos valores sugeridos, ou porque não foram sugeridos.

Analise a receita, dívida, rating e a análise qualitativa para definir valores coerentes. 
"""

model_analista = None
model_especialista = None

try:
    if not api_key:
        raise ValueError("Chave da API do Gemini não encontrada. Defina a variável de ambiente GEMINI_API_KEY.")
    genai.configure(api_key=api_key)

    model_analista = genai.GenerativeModel(
        model_name='gemini-1.5-flash',
        system_instruction=SYSTEM_INSTRUCTION_ANALISTA
    )
    
    model_especialista = genai.GenerativeModel( 
        model_name='gemini-1.5-flash',
        system_instruction=SYSTEM_INSTRUCTION_ESPECIALISTA
    )

except Exception as e:
    print(f"Erro ao inicializar os modelos Gemini: {e}")


@app.route('/analisar', methods=['POST'])
def analisar():
    if not model_analista:
        return jsonify({"erro": "O modelo Analista de IA não foi inicializado corretamente."}), 500

    dados = request.json
    prompt = f"""
    Empresa: {dados.get('empresa', 'N/A')}
    Receita Anual: {dados.get('receita_anual', 'N/A')}
    Dívida Total: {dados.get('divida_total', 'N/A')}
    Prazo de Pagamento: {dados.get('prazo_pagamento', 'N/A')}
    Setor: {dados.get('setor', 'N/A')}
    Rating: {dados.get('rating', 'N/A')}
    Notícias Recentes: {dados.get('noticias_recentes', 'N/A')}
    """

    try:
        resposta = model_analista.generate_content(prompt)
        return jsonify({"analise": resposta.text})
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route('/sugerir_credito', methods=['POST'])
def sugerir_credito():
    if not model_especialista:
        return jsonify({"erro": "O modelo Especialista de IA não foi inicializado corretamente."}), 500

    dados = request.json
    analise_texto = dados.get('analise')
    dados_empresa = dados.get('dados_empresa')

    if not analise_texto or not dados_empresa:
        return jsonify({"erro": "Dados da empresa e texto da análise são obrigatórios."}), 400

    prompt = f"""
    ## Dados da Empresa:
    - Receita Anual: {dados_empresa.get('receita_anual')}
    - Dívida Total: {dados_empresa.get('divida_total')}
    - Prazo de Pagamento: {dados_empresa.get('prazo_pagamento')} meses
    - Rating: {dados_empresa.get('rating')}
    - Setor: {dados_empresa.get('setor')}

    ## Análise Qualitativa Recebida:
    {analise_texto}

    Com base em TUDO isso, gere a sugestão de crédito em formato JSON.
    """
    
    try:
        resposta = model_especialista.generate_content(prompt)
        json_text = resposta.text.strip().replace("```json", "").replace("```", "")
        sugestao = json.loads(json_text)
        return jsonify(sugestao)
    except Exception as e:
        print(f"Erro ao gerar ou processar sugestão: {e}")
        return jsonify({"erro": "Não foi possível gerar a sugestão de crédito."}), 500

if __name__ == "__main__":
    app.run(port=5001, debug=True)