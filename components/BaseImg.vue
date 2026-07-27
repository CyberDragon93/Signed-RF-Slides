<script setup>
// Public-asset <img> that prefixes Vite's base path, so it resolves
// correctly at any route depth (deck, presenter, print) and any deploy base.
const props = defineProps({
  src: { type: String, required: true },
})

const resolved = import.meta.env.BASE_URL + props.src.replace(/^\//, '')
</script>

<template>
  <img :src="resolved" />
</template>
