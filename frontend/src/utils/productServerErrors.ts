export type ProductFormField = 'sizes' | 'childGender' | 'shoeSegment';

/** Splits what the server said about a product into the messages that belong to a form field and the rest. The server
 * sends plain sentences, so the field is told by what the sentence is about. */
export function splitServerErrors(message: string): { fields: Partial<Record<ProductFormField, string>>; rest: string[] } {
  const fields: Partial<Record<ProductFormField, string>> = {};
  const rest: string[] = [];

  for (const part of message.split(';').map((m) => m.trim()).filter(Boolean)) {
    const field = fieldOf(part);
    if (field && !fields[field]) fields[field] = part;
    else rest.push(part);
  }

  return { fields, rest };
}

function fieldOf(message: string): ProductFormField | null {
  if (/мальчик|девочк/i.test(message)) return 'childGender';
  if (/возрастная группа/i.test(message)) return 'shoeSegment';
  if (/размер/i.test(message)) return 'sizes';
  return null;
}
