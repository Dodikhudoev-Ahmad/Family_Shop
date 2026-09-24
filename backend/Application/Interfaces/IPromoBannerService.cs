using Application.Common;
using Application.DTOs;
using Domain.Entities;

namespace Application.Interfaces;

public interface IPromoBannerService
{
    Task<IReadOnlyList<PromoBannerDto>> GetActiveBannersAsync(PromoBannerPlacement placement, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PromoBannerDto>> GetAllBannersAsync(CancellationToken cancellationToken = default);
    Task<Result<PromoBannerDto>> CreateBannerAsync(PromoBannerUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<PromoBannerDto>> UpdateBannerAsync(int id, PromoBannerUpsertDto dto, CancellationToken cancellationToken = default);
    Task<Result<bool>> DeleteBannerAsync(int id, CancellationToken cancellationToken = default);
}
