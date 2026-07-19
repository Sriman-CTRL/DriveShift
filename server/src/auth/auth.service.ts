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

    userId?: string; // Optional user ID for account linking
}

class AuthService {
   async findOrCreateAccount(data: FindOrCreateAccountInput) {
    console.debug("[AuthService] Upserting Google account", {
        provider: data.provider,
        providerUserId: data.providerUserId,
        accessToken: maskToken(data.accessToken),
        refreshToken: maskToken(data.refreshToken),
        tokenExpiry: data.tokenExpiry?.toISOString() ?? null,
        userId: data.userId,
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

        // If a userId was passed in for linking, we associate it if it's different
        if (data.userId && existingAccount.userId !== data.userId) {
            updateData.userId = data.userId;
        }

        const updatedAccount = await prisma.connectedAccount.update({
            where: {
                provider_providerUserId: {
                    provider: data.provider,
                    providerUserId: data.providerUserId,
                },
            },
            data: updateData,
            include: {
                user: true,
            },
        });

        return updatedAccount.user;
    }

    // Account does not exist.
    // If a userId is passed, link to the existing user.
    if (data.userId) {
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) {
            throw new Error(`User with ID ${data.userId} not found`);
        }

        await prisma.connectedAccount.create({
            data: {
                userId: data.userId,
                provider: data.provider,
                providerUserId: data.providerUserId,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                tokenExpiry: data.tokenExpiry,
            },
        });

        return user;
    }

    // No userId passed. Check if a user with the email already exists.
    const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
    });

    if (existingUser) {
        await prisma.connectedAccount.create({
            data: {
                userId: existingUser.id,
                provider: data.provider,
                providerUserId: data.providerUserId,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                tokenExpiry: data.tokenExpiry,
            },
        });
        return existingUser;
    }

    // Otherwise, create a new User and ConnectedAccount
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
