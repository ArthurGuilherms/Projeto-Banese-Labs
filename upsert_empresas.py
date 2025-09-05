import pandas as pd
import psycopg2
import os
from tkinter import Tk, filedialog, messagebox
from dotenv import load_dotenv

load_dotenv()
conexao = psycopg2.connect(
  user=os.getenv("USER"),
  host=os.getenv("HOST"),
  database=os.getenv("DATABASE"),
  password=os.getenv("PASSWORD"),
  port=os.getenv("PORT"),
)
cursor = conexao.cursor()

def upsert_empresa(df):
    for _, row in df.iterrows():
        cursor.execute("""
            INSERT INTO empresas (empresa, receita_anual, divida_total, prazo_pagamento, setor, rating, noticias_recentes)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (empresa)
            DO UPDATE SET
                receita_anual = EXCLUDED.receita_anual,
                divida_total = EXCLUDED.divida_total,
                prazo_pagamento = EXCLUDED.prazo_pagamento,
                setor = EXCLUDED.setor,
                rating = EXCLUDED.rating,
                noticias_recentes = EXCLUDED.noticias_recentes;
        """, (
            row['Empresa'],
            int(row['Receita Anual']),
            int(row['Dívida Total']),
            int(row['Prazo de Pagamento (dias)']),
            row['Setor'],
            row['Rating'],
            row['Notícias Recentes']
        ))
    conexao.commit()

def carregar_dados(caminho_arquivo):
    extensao = os.path.splitext(caminho_arquivo)[1].lower()
    if extensao == '.csv':
        return pd.read_csv(caminho_arquivo)
    elif extensao == '.xml':
        return pd.read_xml(caminho_arquivo)
    elif extensao == '.json':
        return pd.read_json(caminho_arquivo)
    elif extensao == '.parquet':
        return pd.read_parquet(caminho_arquivo)
    else:
        raise ValueError(f"Formato de arquivo {extensao} não suportado.")

def selecionar_e_processar():
    Tk().withdraw() 
    caminho_arquivo = filedialog.askopenfilename(
        title="Selecione o arquivo de dados",
        filetypes=[("Arquivos de dados", "*.csv *.xml *.json *.parquet")]
    )

    if not caminho_arquivo:
        messagebox.showinfo("Operação cancelada", "Nenhum arquivo foi selecionado.")
        return

    try:
        df = carregar_dados(caminho_arquivo)
        df = df.fillna('')  
        upsert_empresa(df)
        messagebox.showinfo("Sucesso", "Dados inseridos/atualizados no banco com sucesso!")
    except Exception as e:
        messagebox.showerror("Erro", f"Ocorreu um erro: {e}")

if __name__ == "__main__":
    selecionar_e_processar()
