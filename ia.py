import os
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from dotenv import load_dotenv
import psycopg2

# Carrega variáveis do arquivo .env
load_dotenv() 

app = Flask(__name__)

# Conexão com o PostgreSQL
conexao = psycopg2.connect(
  user=os.getenv("USER"),
  host=os.getenv("HOST"),
  database=os.getenv("DATABASE"),
  password=os.getenv("PASSWORD"),
  port=os.getenv("PORT"),
)
cursor = conexao.cursor()

# Configuração da API do Gemini 
try:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("Chave da API do Gemini não encontrada. Defina a variável de ambiente GEMINI_API_KEY.")
    genai.configure(api_key=api_key)
except ValueError as e:
    print(f"Erro de configuração: {e}")
    api_key = None 


# Configurações de Segurança do Gemini 
safety_settings = [
    {
        "category": "HARM_CATEGORY_HARASSMENT",
        "threshold": "BLOCK_NONE", 
    },
    {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "threshold": "BLOCK_NONE",
    },
    {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "threshold": "BLOCK_MEDIUM_AND_ABOVE", 
    },
    {
        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        "threshold": "BLOCK_MEDIUM_AND_ABOVE",
    },
]

# Instrução do Sistema
SYSTEM_INSTRUCTION = """
Você é uma Assistente de Análise de Crédito Inteligente, com o objetivo de otimizar o processo de concessão de empréstimos a pequenas e médias empresas.
Sintetize informações, identifique riscos e oportunidades não óbvios nos dados.
Forneça um relatório curto com respostas claras, concisas e baseadas em dados, evitando jargões técnicos.
Gere justificativas e recomendações preliminares para a concessão ou recusa de crédito.
A PRIORIDADE É SER UM RELATÓRIO CURTO COM O ESSENCIAL PARA QUE O USUARIO TOME DECISÕES INFORMADAS.
Forneça apenas a recomendação preliminar e explique brevemente o motivo, sem mais delongas.

Siga o seguinte padrão:
**Recomendação Preliminar:** - INSIRA A RECOMENDAÇÃO AQUI -

**Justificativa:** - INSIRA A JUSTIFICATIVA AQUI -
"""

# Inicialização do Modelo Generativo 
model = None
if api_key:
    try:
        model = genai.GenerativeModel(
            model_name='gemini-2.5-flash', 
            safety_settings=safety_settings,
            system_instruction=SYSTEM_INSTRUCTION
        )
    except Exception as e:
        print(f"Erro ao inicializar o modelo Gemini: {e}")
        model = None 


# Função para buscar dados de uma empresa
def buscar_empresa(nome_empresa):
    cursor.execute("SELECT empresa, receita_anual, divida_total, prazo_pagamento, setor, rating, noticias_recentes FROM empresas WHERE empresa=%s", (nome_empresa,))
    resultado = cursor.fetchone()
    if resultado:
        campos = ["Empresa", "Receita Anual", "Dívida Total", "Prazo de Pagamento (dias)", "Setor", "Rating", "Notícias Recentes"]
        dados = dict(zip(campos, resultado))
        return dados
    else:
        print(f"Empresa '{nome_empresa}' não encontrada.")
        return None

# Função para gerar prompt para IA
def gerar_prompt(dados_empresa):
    prompt_financeiro = f"""
    Você é um consultor financeiro de análise de crédito para banco. Analise os dados a seguir da empresa e forneça recomendações de ação:

    Empresa: {dados_empresa['Empresa']}
    Receita Anual: {dados_empresa['Receita Anual']}
    Dívida Total: {dados_empresa['Dívida Total']}
    Prazo de Pagamento (dias): {dados_empresa['Prazo de Pagamento (dias)']}
    Setor: {dados_empresa['Setor']}
    Rating: {dados_empresa['Rating']}
    Notícias Recentes: {dados_empresa['Notícias Recentes']}

    Por favor, forneça uma análise detalhada e sugestões sobre como a empresa deve proceder.
    """
    return prompt_financeiro

# Função para gerar uma análise financeira
def analise(prompt_financeiro):
    """
    Usa o modelo Gemini para gerar uma análise financeira baseada no prompt fornecido.
    """
    if not model:
        return "O modelo Gemini não foi inicializado corretamente."
    try:
        resposta = model.generate_content(prompt_financeiro)
        return resposta.text
    except Exception as e:
        print(f"Erro ao gerar análise com Gemini: {e}")
        return "Erro ao gerar análise financeira."

# Teste (Escolha uma empresa de 1 a 5000)
nome_empresa = "Empresa 2"
dados_empresa = buscar_empresa(nome_empresa)
prompt_financeiro = gerar_prompt(dados_empresa)
print(analise(prompt_financeiro))
