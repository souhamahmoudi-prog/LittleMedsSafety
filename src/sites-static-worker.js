export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith('/')) {
      url.pathname = `${path}index.html`;
    } else if (!path.split('/').pop()?.includes('.')) {
      url.pathname = `${path}/index.html`;
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};
