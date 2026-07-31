/**
 * Extrai uma mensagem legível a partir de uma resposta de erro da API.
 *
 * Ordem de preferência:
 *   1. `message` devolvido pelo servidor (já escrito para o usuário final)
 *   2. primeiro erro de campo do Zod (`issues.fieldErrors`)
 *   3. mensagem mapeada a partir do código em `error`
 *   4. o texto de fallback informado por quem chamou
 *
 * Nunca expõe detalhes internos: mensagens de exceção do servidor não chegam aqui.
 */

const ERROR_CODE_MESSAGES: Record<string, string> = {
  RATE_LIMITED:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  VALIDATION_ERROR: "Verifique os dados preenchidos e tente novamente.",
  UNAUTHORIZED: "Sua sessão expirou. Entre novamente para continuar.",
  FILE_TOO_LARGE: "Arquivo muito grande. O limite é de 5 MB.",
  FILE_REQUIRED: "Selecione um arquivo para enviar.",
  NOT_FOUND: "Registro não encontrado.",
  SAME_PASSWORD: "A nova senha precisa ser diferente da senha atual.",
  INVALID_PASSWORD: "Senha incorreta.",
  INSUFFICIENT_QUANTITY:
    "A quantidade vendida é maior que a disponível em custódia na data informada.",
  INTERNAL_ERROR: "Erro interno do servidor. Tente novamente em instantes.",
  REGISTER_FAILED: "Não foi possível concluir o cadastro. Tente novamente.",
  IMPORT_FAILED: "Não foi possível processar o arquivo enviado.",
  SYNC_FAILED: "Não foi possível atualizar os dados de mercado.",
};

interface ApiErrorBody {
  error?: string;
  message?: string;
  issues?: {
    fieldErrors?: Record<string, string[] | undefined>;
    formErrors?: string[];
  };
}

export async function extractApiError(response: Response, fallback: string): Promise<string> {
  const data: ApiErrorBody | null = await response.json().catch(() => null);

  if (data?.message) return data.message;

  const fieldErrors = data?.issues?.fieldErrors;
  if (fieldErrors) {
    for (const messages of Object.values(fieldErrors)) {
      if (messages?.[0]) return messages[0];
    }
  }
  if (data?.issues?.formErrors?.[0]) return data.issues.formErrors[0];

  if (data?.error && ERROR_CODE_MESSAGES[data.error]) return ERROR_CODE_MESSAGES[data.error]!;

  // Status conhecidos, quando o corpo não trouxe nada aproveitável.
  if (response.status === 429) return ERROR_CODE_MESSAGES.RATE_LIMITED!;
  if (response.status === 401) return ERROR_CODE_MESSAGES.UNAUTHORIZED!;

  return fallback;
}
