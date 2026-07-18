import prisma from "../config/prisma";

const maskToken = (value?: string | null) => {
    if (!value) return "none";
    return `${value.slice(0, 6)}...${value.slice(-4)} (len=${value.length})`;
};

export interface FindOrCreateAccountInput {
    provider: string;
    providerUserId: string;
    email: string;
    name: string;

    accessToken: string;
    refreshToken?: string;
    tokenExpiry?: Date;
}

class AuthService {
   async findOrCreateAccount(data: FindOrCreateAccountInput) {
    console.debug("[AuthService] Upserting Google account", {
        provider: data.provider,
        providerUserId: data.providerUserId,
        accessToken: maskToken(data.accessToken),
        refreshToken: maskToken(data.refreshToken),
        tokenExpiry: data.tokenExpiry?.toISOString() ?? null,
    });

    const existingAccount = await prisma.connectedAccount.findUnique({
        where: {
            provider_providerUserId: {
                provider: data.provider,
                providerUserId: data.providerUserId,
            },
        },
        include: {
            user: true,
        },
    });

    if (existingAccount) {

    const updateData: any = {
        accessToken: data.accessToken,
        tokenExpiry: data.tokenExpiry,
    };

    // Only overwrite refresh token if Google returned a new one
    if (data.refreshToken) {
        updateData.refreshToken = data.refreshToken;
    }

    await prisma.connectedAccount.update({
        where: {
            provider_providerUserId: {
                provider: data.provider,
                providerUserId: data.providerUserId,
            },
        },
        data: updateData,
    });

    return existingAccount.user;
}

    return prisma.user.create({
        data: {
            email: data.email,
            name: data.name,
            accounts: {
                create: {
                    provider: data.provider,
                    providerUserId: data.providerUserId,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    tokenExpiry: data.tokenExpiry,
                },
            },
        },
    });
}

}

export const authService = new AuthService()
