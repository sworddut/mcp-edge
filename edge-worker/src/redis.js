function getRedisConfig(env) {
  const baseUrl = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!baseUrl || !token) {
    return null;
  }
  return {
    baseUrl: String(baseUrl).replace(/\/+$/, ""),
    token: String(token),
  };
}

async function redisCommand(env, command) {
  const config = getRedisConfig(env);
  if (!config) {
    return null;
  }
  try {
    const res = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export async function redisGetJson(env, key) {
  const payload = await redisCommand(env, ["GET", key]);
  const text = payload?.result;
  if (!text || typeof text !== "string") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function redisSetJson(env, key, ttlSeconds, value) {
  const body = JSON.stringify(value);
  await redisCommand(env, ["SETEX", key, String(ttlSeconds), body]);
}
