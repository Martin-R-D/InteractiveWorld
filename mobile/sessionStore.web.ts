export const readSession = async () => sessionStorage.getItem('interactiveworld.account');
export const writeSession = async (value: string) => {
  sessionStorage.setItem('interactiveworld.account', value);
};
export const clearSession = async () => {
  sessionStorage.removeItem('interactiveworld.account');
};
