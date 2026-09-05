/**
 * Parse only exact GitHub owner/repository identifier forms. This validation is
 * retained at the provider boundary while the GitHub adapter is disabled.
 *
 * @param {unknown} address
 * @returns {{owner: string, repository: string} | null}
 */
export function parseGitHubRepositoryAddress(address) {
  const input = String(address == null ? "" : address).trim();
  if (input === "" || /[?#]/.test(input)) return null;

  let owner;
  let repository;
  const sshMatch = input.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  const sshUrlMatch = input.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+)$/i);
  const matchedSsh = sshMatch || sshUrlMatch;
  if (matchedSsh) {
    owner = matchedSsh[1];
    repository = matchedSsh[2];
  } else if (/^(?:https?:\/\/)?github\.com\//i.test(input)) {
    const urlInput = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    let url;
    try {
      url = new URL(urlInput);
    } catch {
      return null;
    }
    if (
      url.hostname.toLowerCase() !== "github.com" ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      (url.protocol !== "https:" && url.protocol !== "http:")
    ) return null;
    const pathParts = url.pathname.split("/").filter((part) => part !== "");
    if (pathParts.length !== 2) return null;
    [owner, repository] = pathParts;
  } else {
    const shorthandMatch = input.match(/^([^/]+)\/([^/]+)$/);
    if (!shorthandMatch) return null;
    owner = shorthandMatch[1];
    repository = shorthandMatch[2];
  }

  repository = repository.replace(/\.git$/i, "");
  const ownerIsValid = owner.length <= 39 &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner) &&
    !owner.includes("--");
  const repositoryIsValid = repository.length > 0 &&
    repository.length <= 100 &&
    /^[A-Za-z0-9._-]+$/.test(repository) &&
    repository !== "." && repository !== "..";
  return ownerIsValid && repositoryIsValid ? { owner, repository } : null;
}
