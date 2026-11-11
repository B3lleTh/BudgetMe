import '@fontsource-variable/public-sans';
import './estilos/tokens.css';
import './lib/vendor/iso.css';
import './estilos/sistema.css';
import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
