import assert from "node:assert/strict";
import test from "node:test";
import { SendMvpMessageBody } from "@workspace/api-zod";
import { formatStylingContext } from "./stylingContext";
import { weatherContext } from "./outfitEngine";

test("quick chat needs no context, occasion, dress code, or photos", () => {
  assert(SendMvpMessageBody.safeParse({ content: "How does my outfit look?" }).success);
  assert(SendMvpMessageBody.safeParse({ content: "Advice?", stylingContext: { temperature: 18 } }).success);
  assert(!SendMvpMessageBody.safeParse({ content: "Advice?", stylingContext: { temperature: 90 } }).success);
  assert(!SendMvpMessageBody.safeParse({ content: "Advice?", stylingContext: { latitude: 999 } }).success);
  assert(!SendMvpMessageBody.safeParse({ content: "Advice?", stylingContext: null }).success);
});

test("persisted styling details include choices but never precise coordinates", () => {
  const text = formatStylingContext({
    occasion: "Dinner", dressCode: "smart_casual", activities: "Walking",
    exclusions: ["wool", "jackets"], outdoor: true, temperature: 18, precipitation: 2,
    latitude: 19.076091, longitude: 72.877426, useWeather: true,
  });
  for (const value of ["Dinner", "smart casual", "Walking", "wool, jackets", "18 °C", "2 mm"]) assert(text.includes(value));
  for (const value of ["19.076091", "72.877426", "latitude", "longitude"]) assert(!text.includes(value));
});

test("weather is never fetched without opt-in; manual values survive", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected fetch"); };
  try {
    const result = await weatherContext({ temperature: 16, precipitation: 1, latitude: 10, longitude: 20, useWeather: false });
    assert.equal(calls, 0);
    assert.equal(result.context.temperature, 16);
    assert.equal(result.context.precipitation, 1);
  } finally { globalThis.fetch = original; }
});

test("forecast failure keeps manual fallback and explains failure", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    const result = await weatherContext({ temperature: 16, precipitation: 1, weatherLabel: "Breezy", useWeather: true, latitude: 10, longitude: 20 });
    assert.equal(result.context.temperature, 16);
    assert.equal(result.context.precipitation, 1);
    assert(result.context.weatherLabel?.includes("Breezy"));
    assert(formatStylingContext(result.context, result.warnings).includes("could not be retrieved"));
  } finally { globalThis.fetch = original; }
});

test("successful opted-in forecast supplies actual conditions", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ current: { temperature_2m: 23 }, daily: { precipitation_sum: [3] } }));
  };
  try {
    const result = await weatherContext({ useWeather: true, latitude: 10, longitude: 20 });
    assert.equal(calls, 1);
    assert.equal(result.context.temperature, 23);
    assert.equal(result.context.precipitation, 3);
    assert(result.context.weatherLabel?.includes("Open-Meteo"));
  } finally { globalThis.fetch = original; }
});
