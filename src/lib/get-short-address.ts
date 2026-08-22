// pkc-js exports a getShortAddress, but it validates its argument against a zod schema that wants
// { name } and throws a ZodError on anything else. Both 5chan and seedit dropped that dependency in
// favour of the same six-line helper, which is all the shortening actually is.
const getShortAddress = (address?: string): string => {
  if (!address) return '';
  if (address.includes('.')) return address;
  if (address.length < 20) return '';
  return address.slice(8, 20);
};

export default getShortAddress;
