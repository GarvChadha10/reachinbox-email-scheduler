-- Atomic per-sender slot reservation (Redis single node assumed).
-- KEYS[1] = rl:next:{sender}  earliest next allowed send time (ms)
-- ARGV    = now, delay, senderCap, campaignCap, HOUR, sender, campaign
local now         = tonumber(ARGV[1])
local delay       = tonumber(ARGV[2])
local senderCap   = tonumber(ARGV[3])
local campaignCap = tonumber(ARGV[4])
local HOUR        = tonumber(ARGV[5])
local sender      = ARGV[6]
local campaign    = ARGV[7]

local slot = math.max(now, tonumber(redis.call('GET', KEYS[1]) or '0'))
-- The window is derived from the slot time, not from `now`.
local win  = math.floor(slot / HOUR)
local sKey = 'rl:cnt:' .. sender .. ':' .. win
local cKey = 'rl:cnt:' .. sender .. ':' .. campaign .. ':' .. win

if tonumber(redis.call('GET', sKey) or '0') >= senderCap then
  return {1, (win + 1) * HOUR, 'sender'}
end
if tonumber(redis.call('GET', cKey) or '0') >= campaignCap then
  return {1, (win + 1) * HOUR, 'campaign'}
end

redis.call('INCR', sKey)
redis.call('PEXPIRE', sKey, 2 * HOUR)
redis.call('INCR', cKey)
redis.call('PEXPIRE', cKey, 2 * HOUR)
redis.call('SET', KEYS[1], slot + delay, 'PX', 2 * HOUR)
return {0, slot}
