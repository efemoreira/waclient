export function validarTelefone(telefone: string): boolean {
  // Remove caracteres não numéricos
  const cleaned = telefone.replace(/\D/g, '');
  
  // Valida formato brasileiro: 55 + DDD (2 dígitos) + número (8 ou 9 dígitos)
  const regex = /^55\d{2}9?\d{8}$/;
  return regex.test(cleaned);
}
