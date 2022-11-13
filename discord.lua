discord_protocol = Proto("Discord",  "Discord Media Protocol")

-- ip discovery fields
message_type = ProtoField.int16("discord.message_type", "Message Type", base.DEC)
message_length = ProtoField.int16("discord.message_length", "Message Length", base.DEC)
ssrc = ProtoField.uint32("discord.ssrc", "SSRC", base.DEC)
ip_address = ProtoField.stringz("discord.address", "IP Address", base.ASCII)
port = ProtoField.uint16("discord.port", "Port", base.DEC)

-- voice packet fields
sequence = ProtoField.framenum("discord.sequence", "Sequence")
timestamp = ProtoField.uint16("discord.timestamp", "Timestamp", base.DEC)
-- [ssrc]
data = ProtoField.ubytes("discord.data", "Encrypted Media Data")


discord_protocol.fields = {
  message_type, message_length, ssrc, ip_address, port,
  sequence, timestamp, data
}

rtp_dissector = Dissector.get("rtp")


function ip_discovery_dissector(buffer, pinfo, tree)
  pinfo.cols.protocol = discord_protocol.name
  local subtree = tree:add(discord_protocol, buffer(), "Discord IP Discovery")

  local message_type_number = buffer(0, 2):uint()

  if message_type_number == 1 then
    message_type_name = "IP Discovery Request"
	  pinfo.cols.info = "Discord IP Discovery Request"
  elseif message_type_number == 2 then
    message_type_name = "IP Discovery Response"
    pinfo.cols.info = "Discord IP Discovery Response"
  end

  subtree:add(message_type, message_type_number):append_text(" (" .. message_type_name .. ")")

  subtree:add(message_length, buffer(2, 2)):append_text(" (Should be 70)")
  subtree:add(ssrc, buffer(4, 4))
  subtree:add(ip_address, buffer(8, 64))
  subtree:add(port, buffer(72, 2))
end

function voice_packet_dissector(buffer, pinfo, tree)
  length = buffer:len()
  if length <= 12 then return end

  pinfo.cols.protocol = discord_protocol.name
  local subtree = tree:add(discord_protocol, buffer(), "Discord Media Data")

  rtp_dissector:call(buffer, pinfo, subtree)

  --subtree:add(sequence, buffer(2, 2):uint())
  --subtree:add(timestamp, buffer(4, 4))
  --subtree:add(ssrc, buffer(8, 4))
  --subtree:add(data, buffer(12))
end

function discord_protocol.dissector(buffer, pinfo, tree)
  length = buffer:len()
  if length == 0 then return end

  local first_two_bytes = buffer(0, 2):uint()
  if first_two_bytes == 1 or first_two_bytes == 2 then
	ip_discovery_dissector(buffer, pinfo, tree)
  else
	voice_packet_dissector(buffer, pinfo, tree)
  end

end

local udp_port = DissectorTable.get("udp.port")

-- discord picks a random port between 50000 and 65535
-- source https://twitter.com/discord/status/793626299617120256
for i = 50000, 65535, 1 do
	udp_port:add(i, discord_protocol)
end

-- debugging
udp_port:add(41236, discord_protocol)
