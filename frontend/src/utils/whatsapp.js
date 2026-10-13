export function whatsAppShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
