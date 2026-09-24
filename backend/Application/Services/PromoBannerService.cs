using Application.Common;
using Application.DTOs;
using Application.Interfaces;
using Domain.Entities;
using Domain.Interfaces;

namespace Application.Services;

public class PromoBannerService : IPromoBannerService
{
    private readonly IUnitOfWork _unitOfWork;

    public PromoBannerService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<PromoBannerDto>> GetActiveBannersAsync(PromoBannerPlacement placement, CancellationToken cancellationToken = default)
    {
        var banners = await _unitOfWork.PromoBanners.GetActiveAsync(placement, cancellationToken);
        return banners.Select(ToDto).ToList();
    }

    public async Task<IReadOnlyList<PromoBannerDto>> GetAllBannersAsync(CancellationToken cancellationToken = default)
    {
        var banners = await _unitOfWork.PromoBanners.GetAllAsync(cancellationToken);
        return banners.OrderBy(b => b.SortOrder).ThenBy(b => b.Id).Select(ToDto).ToList();
    }

    public async Task<Result<PromoBannerDto>> CreateBannerAsync(PromoBannerUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var banner = new PromoBanner
        {
            Title = dto.Title.Trim(),
            Subtitle = dto.Subtitle?.Trim(),
            ButtonText = dto.ButtonText?.Trim(),
            ButtonLink = dto.ButtonLink?.Trim(),
            ImageUrl = dto.ImageUrl?.Trim(),
            IsActive = dto.IsActive,
            SortOrder = dto.SortOrder,
            Placement = dto.Placement
        };

        await _unitOfWork.PromoBanners.AddAsync(banner, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<PromoBannerDto>.Success(ToDto(banner));
    }

    public async Task<Result<PromoBannerDto>> UpdateBannerAsync(int id, PromoBannerUpsertDto dto, CancellationToken cancellationToken = default)
    {
        var banner = await _unitOfWork.PromoBanners.GetByIdAsync(id, cancellationToken);
        if (banner is null)
        {
            return Result<PromoBannerDto>.Failure("Баннер не найден.");
        }

        banner.Title = dto.Title.Trim();
        banner.Subtitle = dto.Subtitle?.Trim();
        banner.ButtonText = dto.ButtonText?.Trim();
        banner.ButtonLink = dto.ButtonLink?.Trim();
        banner.ImageUrl = dto.ImageUrl?.Trim();
        banner.IsActive = dto.IsActive;
        banner.SortOrder = dto.SortOrder;
        banner.Placement = dto.Placement;

        _unitOfWork.PromoBanners.Update(banner);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<PromoBannerDto>.Success(ToDto(banner));
    }

    public async Task<Result<bool>> DeleteBannerAsync(int id, CancellationToken cancellationToken = default)
    {
        var banner = await _unitOfWork.PromoBanners.GetByIdAsync(id, cancellationToken);
        if (banner is null)
        {
            return Result<bool>.Failure("Баннер не найден.");
        }

        _unitOfWork.PromoBanners.Remove(banner);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result<bool>.Success(true);
    }

    private static PromoBannerDto ToDto(PromoBanner b) => new(
        b.Id, b.Title, b.Subtitle, b.ButtonText, b.ButtonLink, b.ImageUrl, b.IsActive, b.SortOrder, b.Placement);
}
