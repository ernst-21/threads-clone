'use server';

import { revalidatePath } from 'next/cache';
import Thread from '../models/thread.model';
import User from '../models/user.model';
import { connectToDB } from '../mongoose';
import mongoose from 'mongoose';

interface Params {
	text: string;
	author: string;
	communityId: string | null;
	path: string;
}

export async function createThread({
	text,
	author,
	communityId,
	path,
}: Params) {
	connectToDB();

	try {
		const createdThread = await Thread.create({
			text,
			author,
			community: null,
		});

		// update user model
		await User.findByIdAndUpdate(author, {
			$push: { threads: createdThread._id },
		});

		revalidatePath(path);
	} catch (error: any) {
		throw new Error(`Failed to create a Thread ${error.message}`);
	}
}

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
	connectToDB();

	// calculate the amount of posts to skip
	const skipAmount = (pageNumber - 1) * pageSize;

	try {
		// fecth the posts that have no parent (top level threads... )
		const postsQuery = Thread.find({
			parentId: { $in: [null, undefined] },
		})
			.sort({ createdAt: 'desc' })
			.skip(skipAmount)
			.limit(pageSize)
			.populate({ path: 'author', model: User })
			.populate({
				path: 'children',
				model: User,
				select: 'id name parentId image',
			});

		const totalPostCount = await Thread.countDocuments({
			parentId: { $in: [null, undefined] },
		});

		const posts = await postsQuery.exec();

		const isNext = totalPostCount > skipAmount * posts.length;

		return { posts, isNext };
	} catch (error: any) {
		throw new Error(`Failed to fetch threads: ${error.message}`);
	}
}

export async function fecthThreadById(id: string) {
	connectToDB();

	try {
		// TODO: populate community
		const thread = await Thread.findById(id)
			.populate({
				path: 'author',
				model: User,
				select: '_id id name image',
			})
			.populate({
				path: 'children',
				populate: [
					{
						path: 'author',
						model: User,
						select: '_id id name parentId image',
					},
					{
						path: 'children',
						model: Thread,
						populate: {
							path: 'author',
							model: User,
							select: '_id id name parentId image',
						},
					},
				],
			})
			.exec();

		return thread;
	} catch (error: any) {
		throw new Error(`Failed to find thread ${error.message}`);
	}
}

export async function addCommentToThread(
	threadId: string,
	commentText: string,
	userId: string,
	path: string
) {
	connectToDB();

	try {
		// Fin orginal Thread by its Id
		const originalThread = await Thread.findById(threadId);

		if (!originalThread) {
			throw new Error('No thread found for this comment');
		}

		// Create a new thread with the comment text
		const commentThread = new Thread({
			text: commentText,
			author: userId,
			parentId: threadId,
		});
		// save the new thread
		const savedCommentThread = await commentThread.save();

		originalThread.children.push(savedCommentThread._id);

		await originalThread.save();
		revalidatePath(path);
	} catch (error: any) {}
}
