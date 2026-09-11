// Isolated transport test. Ring allocation and unrelated Dolphin types are test doubles.
// The command struct, API declaration and three method bodies are extracted unchanged
// from the verified patched C++ sources by verify_texture_producer.py.
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <vector>
using u32 = std::uint32_t;
using u8 = std::uint8_t;
#include "record.inc"
static_assert(sizeof(CmdRecord) == 32);
enum class CmdOp : u32 { CreateTexture = 7 };
class WebGPUCommandStream {
public:
#include "declaration.inc"
  bool m_header = true, accept = true, poisoned = false;
  u32 m_next_id = 1;
  std::vector<CmdRecord> records;
  void EnsureRing() {}
  bool ready() const { return m_header; }
  void PoisonPass() { poisoned = true; }
  bool Push(const CmdRecord& record) {
    if (!accept) return false;
    records.push_back(record);
    return true;
  }
};
WebGPUCommandStream stream;
WebGPUCommandStream& GetCommandStream() { return stream; }
struct TextureConfig { u32 width, height, levels, layers, format; };
class AbstractTexture {
public:
  TextureConfig m_config;
  explicit AbstractTexture(const TextureConfig& config) : m_config(config) {}
};
u32 GetTexelSizeForFormat(u32) { return 4; }
u32 MapTexFormat(u32 format) { return format; }
constexpr u32 kTexUsage = 1 | 2 | 4 | 0x10;
class WebGPUTexture : public AbstractTexture {
public:
  explicit WebGPUTexture(const TextureConfig& config);
  u32 EnsureBridgeId();
  u32 m_bridge_id = 0;
  std::vector<std::vector<std::vector<u8>>> m_data;
};
#include "methods.inc"

bool first = true;
void emit(const char* name, const CmdRecord& record, u32 width, u32 height, u32 layers, u32 levels) {
  assert(record.op == 7);
  assert(record.arg.u[0] != 0);
  assert(record.arg.u[1] == width && record.arg.u[2] == height);
  assert(record.arg.u[3] == 0 && record.arg.u[4] == kTexUsage);
  assert(record.arg.u[5] == layers && record.arg.u[6] == levels);
  if (!first) std::cout << ",\n";
  first = false;
  std::cout << "{\"name\":\"" << name << "\",\"record\":[" << record.op;
  for (u32 word : record.arg.u) std::cout << ',' << word;
  std::cout << "]}";
}

int main() {
  std::cout << "[\n";
  WebGPUTexture single({8, 4, 1, 1, 0});
  emit("single", stream.records.back(), 8, 4, 1, 1);
  WebGPUTexture array({7, 3, 3, 2, 0});
  emit("non-power-of-two-array", stream.records.back(), 7, 3, 2, 3);
  assert(array.m_data[1][2].size() == 4);
  WebGPUTexture brawl({512, 512, 6, 1, 0});
  emit("brawl-six-levels", stream.records.back(), 512, 512, 1, 6);
  const auto count = stream.records.size();
  assert(brawl.EnsureBridgeId() == brawl.m_bridge_id && stream.records.size() == count);

  stream.m_header = false;
  WebGPUTexture delayed({16, 8, 4, 2, 0});
  assert(delayed.m_bridge_id == 0 && stream.records.size() == count);
  stream.m_header = true;
  assert(delayed.EnsureBridgeId() != 0);
  emit("delayed-creation", stream.records.back(), 16, 8, 2, 4);

  stream.accept = false;
  WebGPUTexture retry({4, 4, 3, 1, 0});
  assert(retry.m_bridge_id == 0);
  stream.accept = true;
  assert(retry.EnsureBridgeId() != 0);
  emit("retry-after-ring-rejection", stream.records.back(), 4, 4, 1, 3);

  assert(stream.PushCreateTexture(1, 1, 0, kTexUsage) != 0);
  emit("default-dummy", stream.records.back(), 1, 1, 1, 1);
  assert(stream.PushCreateTexture(1, 1, 0, kTexUsage, 0, 0) != 0);
  emit("zero-defaults", stream.records.back(), 1, 1, 1, 1);
  stream.m_header = false;
  assert(stream.PushCreateTexture(1, 1, 0, kTexUsage) == 0 && stream.poisoned);
  std::cout << "\n]\n";
}
