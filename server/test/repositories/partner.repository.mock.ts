import { IPartnerRepository } from 'src/interfaces/partner.repository';

export const newPartnerRepositoryMock = (): jest.Mocked<IPartnerRepository> => {
  return {
    create: jest.fn(),
    remove: jest.fn(),
    getAll: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  };
};
