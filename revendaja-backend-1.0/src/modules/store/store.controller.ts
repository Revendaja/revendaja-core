import type { FastifyReply, FastifyRequest } from 'fastify';
import { storeService } from './store.service';
import type {
  AddStoreProductInput,
  CreateManualStoreProductInput,
  CreateStoreCategoryInput,
  CreateStoreInput,
  ListStoreProductsQuery,
  SetMonthlyGoalInput,
  StoreCategoryParams,
  StoreProductParams,
  UpdateStoreInput,
  UpdateStoreProductInput,
  UpdateStoreSettingsInput,
} from './store.schema';

export async function createStore(
  request: FastifyRequest<{ Body: CreateStoreInput }>,
  reply: FastifyReply,
) {
  const store = await storeService.createStore(request.userId as string, request.body.storeName);
  return reply.status(201).send(store);
}

export async function updateStore(
  request: FastifyRequest<{ Body: UpdateStoreInput }>,
  reply: FastifyReply,
) {
  const store = await storeService.updateStore(request.userId as string, request.body);
  return reply.send(store);
}

export async function setMonthlyGoal(
  request: FastifyRequest<{ Body: SetMonthlyGoalInput }>,
  reply: FastifyReply,
) {
  const monthlyGoal = await storeService.setMonthlyGoal(
    request.userId as string,
    request.body.monthlyGoal,
  );
  return reply.send({ monthlyGoal });
}

export async function getStoreSettings(request: FastifyRequest, reply: FastifyReply) {
  const settings = await storeService.getSettings(request.userId as string);
  return reply.send(settings);
}

export async function getStorePlan(request: FastifyRequest, reply: FastifyReply) {
  const plan = await storeService.getPlanUsage(request.userId as string);
  return reply.send(plan);
}

export async function updateStoreSettings(
  request: FastifyRequest<{ Body: UpdateStoreSettingsInput }>,
  reply: FastifyReply,
) {
  const settings = await storeService.updateSettings(request.userId as string, request.body);
  return reply.send(settings);
}

export async function addStoreProduct(
  request: FastifyRequest<{ Body: AddStoreProductInput }>,
  reply: FastifyReply,
) {
  const storeProduct = await storeService.addProduct(request.userId as string, request.body);
  return reply.status(201).send(storeProduct);
}

export async function addManualStoreProduct(
  request: FastifyRequest<{ Body: CreateManualStoreProductInput }>,
  reply: FastifyReply,
) {
  const storeProduct = await storeService.addManualProduct(request.userId as string, request.body);
  return reply.status(201).send(storeProduct);
}

export async function listStoreProducts(
  request: FastifyRequest<{ Querystring: ListStoreProductsQuery }>,
  reply: FastifyReply,
) {
  const result = await storeService.listProducts(request.userId as string, request.query);
  return reply.send(result);
}

export async function getStoreProduct(
  request: FastifyRequest<{ Params: StoreProductParams }>,
  reply: FastifyReply,
) {
  const storeProduct = await storeService.getProduct(request.userId as string, request.params.id);
  return reply.send(storeProduct);
}

export async function updateStoreProduct(
  request: FastifyRequest<{ Params: StoreProductParams; Body: UpdateStoreProductInput }>,
  reply: FastifyReply,
) {
  const storeProduct = await storeService.updateProduct(
    request.userId as string,
    request.params.id,
    request.body,
  );
  return reply.send(storeProduct);
}

export async function removeStoreProduct(
  request: FastifyRequest<{ Params: StoreProductParams }>,
  reply: FastifyReply,
) {
  await storeService.removeProduct(request.userId as string, request.params.id);
  return reply.status(204).send();
}

export async function listStoreCategories(request: FastifyRequest, reply: FastifyReply) {
  const categories = await storeService.listCategories(request.userId as string);
  return reply.send({ items: categories });
}

export async function createStoreCategory(
  request: FastifyRequest<{ Body: CreateStoreCategoryInput }>,
  reply: FastifyReply,
) {
  const category = await storeService.createCategory(request.userId as string, request.body.name);
  return reply.status(201).send(category);
}

export async function removeStoreCategory(
  request: FastifyRequest<{ Params: StoreCategoryParams }>,
  reply: FastifyReply,
) {
  await storeService.deleteCategory(request.userId as string, request.params.id);
  return reply.status(204).send();
}
