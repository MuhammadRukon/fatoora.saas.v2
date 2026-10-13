export function removeOccur(str: string, char: string, withChar: string = ''): string {
  if (!str) return '';
  return str.replace(new RegExp(char, 'g'), withChar);
}

export const uppercase = (text: string, forAll: boolean = false): string => {
  if (!text) return '';

  const textArray = text.toLowerCase().split(' ');
  textArray[0] = textArray[0].charAt(0).toUpperCase() + textArray[0].slice(1);

  if (forAll) {
    return textArray.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  return textArray.join(' ');
};

export function slugify(value: string) {
  return value.trim().replace(/\s+/g, '-');
}
