// Sirve la pagina de presentacion (public/index.html)
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
