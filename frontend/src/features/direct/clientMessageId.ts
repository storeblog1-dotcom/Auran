let clientMessageSequence = 0;

export const createDirectClientMessageId = () => {
  clientMessageSequence = (clientMessageSequence + 1) % 0xffff;
  const randomPart = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    }
  );
  const sequencePart = clientMessageSequence.toString(16).padStart(4, "0");
  return `${randomPart.slice(0, -4)}${sequencePart}`;
};
