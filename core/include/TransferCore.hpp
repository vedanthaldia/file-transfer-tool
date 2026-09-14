#pragma once
#include <vector>
#include <cstdint>
#include <cstddef>
#include <zstd.h>

class TransferCore {
private:
    std::vector<uint8_t> sendInputBuffer;
    std::vector<uint8_t> sendOutputBuffer;
    std::vector<uint8_t> recvInputBuffer;
    std::vector<uint8_t> recvOutputBuffer;

public:
    explicit TransferCore(size_t chunkSize);

    uint8_t* getSendInputPointer();
    size_t getSendInputCapacity() const;
    uint8_t* getSendOutputPointer();

    uint8_t* getRecvInputPointer();
    uint8_t* getRecvOutputPointer();

    size_t compressChunk(size_t actualBytes);
    size_t decompressChunk(size_t compressedBytes);
};