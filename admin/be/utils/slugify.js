// text -> url-safe slug, handles estonian chars
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[äàáâãå]/g, 'a')
    .replace(/[öòóôõ]/g, 'o')
    .replace(/[üùúû]/g, 'u')
    .replace(/[ëèéê]/g, 'e')
    .replace(/[ïìíî]/g, 'i')
    .replace(/[šś]/g, 's')
    .replace(/[žź]/g, 'z')
    .replace(/[ñ]/g, 'n')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
