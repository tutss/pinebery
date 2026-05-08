import { mount } from 'svelte'
import Options from './Options.svelte'

const target = document.getElementById('app')
if (!target) {
  throw new Error('pinebery: #app root element not found')
}

mount(Options, { target })
